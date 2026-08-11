// ╔══════════════════════════════════════════════════════════════════╗
// ║                                                                  ║
// ║                   ELAH | A GREYFOUNDRY PROJECT                   ║
// ║                                                                  ║
// ║               https://github.com/greyfoundry/elah                ║
// ║                                                                  ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// Copyright © 2026 Greyfoundry contributors.
// SPDX-FileCopyrightText: 2026 Greyfoundry contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// SPDX-License-Identifier: Apache-2.0
//

import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  CLIENT_LAB_COMPATIBILITY,
  ClientLaboratoryError,
  assertPinnedPaperSource
} from './compatibility.mjs'
import { downloadPinnedPaper } from './download-paper.mjs'
import { ClientLaboratoryLedger } from './ledger.mjs'
import { PaperLaboratory } from './paper.mjs'
import { runClientSession } from './session.mjs'

const DIRECTIONS = Object.freeze(['forward', 'right', 'back', 'left'])
const CLI_OPTIONS = new Map([
  ['--report', 'report'],
  ['--java', 'java'],
  ['--paper-cache', 'paperCache']
])

export function parseClientLaboratoryArgs (args) {
  const options = {
    report: 'build/reports/client-laboratory/report.json',
    java: 'java',
    paperCache: 'build/cache/client-laboratory'
  }
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args
  const seen = new Set()
  for (let index = 0; index < normalizedArgs.length; index += 2) {
    const flag = normalizedArgs[index]
    const key = CLI_OPTIONS.get(flag)
    if (!key) throw new ClientLaboratoryError('unknown_option', `unknown option ${String(flag)}`)
    if (seen.has(flag)) throw new ClientLaboratoryError('duplicate_option', `option ${flag} was repeated`)
    const value = normalizedArgs[index + 1]
    if (typeof value !== 'string' || value === '' || value.startsWith('--')) {
      throw new ClientLaboratoryError('missing_option_value', `option ${flag} requires a value`)
    }
    options[key] = value
    seen.add(flag)
  }
  return options
}

export async function runClientLaboratory (options, dependencyOverrides = {}) {
  const validatedOptions = validateOptions(options)
  assertPinnedPaperSource({
    url: CLIENT_LAB_COMPATIBILITY.paperUrl,
    sha256: CLIENT_LAB_COMPATIBILITY.paperSha256,
    maxBytes: CLIENT_LAB_COMPATIBILITY.paperMaxBytes
  })

  const dependencies = {
    downloadPaper: downloadPinnedPaper,
    PaperClass: PaperLaboratory,
    reservePort: reserveLoopbackPort,
    runSession: runClientSession,
    botFactory: dependencyOverrides.botFactory,
    ...dependencyOverrides
  }
  const ledger = new ClientLaboratoryLedger({ compatibility: CLIENT_LAB_COMPATIBILITY })
  const reportDirectory = dirname(validatedOptions.report)
  await mkdir(reportDirectory, { recursive: true })
  const paperRoot = await mkdtemp(join(reportDirectory, '.paper-'))
  const paperJar = join(validatedOptions.paperCache, CLIENT_LAB_COMPATIBILITY.paperFile)
  const activeBots = new Set()
  const cancelledBots = new WeakSet()
  let paper
  let primaryError
  let report

  try {
    const artifact = await dependencies.downloadPaper({
      destination: paperJar,
      compatibility: CLIENT_LAB_COMPATIBILITY
    })
    const port = await dependencies.reservePort()
    paper = new dependencies.PaperClass({
      java: validatedOptions.java,
      root: paperRoot,
      jar: artifact.path,
      port
    })
    await paper.start()

    let realBotFactory = dependencies.botFactory
    if (!realBotFactory) {
      const mineflayer = await import('mineflayer')
      realBotFactory = mineflayer.createBot ?? mineflayer.default?.createBot
    }
    if (typeof realBotFactory !== 'function') {
      throw new ClientLaboratoryError('mineflayer_unavailable', 'Mineflayer did not expose createBot')
    }
    const trackingBotFactory = (botOptions) => {
      const bot = realBotFactory(botOptions)
      activeBots.add(bot)
      if (typeof bot?.once === 'function') bot.once('end', () => activeBots.delete(bot))
      return bot
    }

    for (let wave = 1; wave <= CLIENT_LAB_COMPATIBILITY.waves; wave += 1) {
      const sessions = []
      for (let offset = 0; offset < CLIENT_LAB_COMPATIBILITY.concurrency; offset += 1) {
        const ordinal = (wave - 1) * CLIENT_LAB_COMPATIBILITY.concurrency + offset + 1
        const suffix = String(ordinal).padStart(3, '0')
        const sessionId = `session-${suffix}`
        const username = `elah_lab_${suffix}`
        const direction = DIRECTIONS[(ordinal - 1) % DIRECTIONS.length]
        ledger.startSession({ sessionId, username, wave })
        const session = dependencies.runSession({
          sessionId,
          username,
          endpoint: { host: '127.0.0.1', port },
          version: CLIENT_LAB_COMPATIBILITY.minecraftVersion,
          direction,
          botFactory: trackingBotFactory,
          positionProbe: (name) => paper.queryPosition(name),
          ledger
        }).catch((error) => {
          cancelActiveBots(activeBots, cancelledBots)
          throw error
        })
        sessions.push(session)
      }
      const results = await Promise.allSettled(sessions)
      const failed = results.find(({ status }) => status === 'rejected')
      if (failed) throw failed.reason
      ledger.completeWave(wave)
    }
  } catch (error) {
    primaryError = error
    cancelActiveBots(activeBots, cancelledBots)
  } finally {
    if (paper) {
      try {
        const cleanup = await paper.stop()
        if (!primaryError) ledger.recordServerCleanup(cleanup)
      } catch (error) {
        if (!primaryError) primaryError = error
      }
    }

    if (primaryError) {
      report = ledger.fail(primaryError)
      report.compatibility = structuredClone(CLIENT_LAB_COMPATIBILITY)
      report.diagnostics = paper?.diagnostics?.() ?? []
    } else {
      try {
        report = ledger.finalize()
      } catch (error) {
        report = ledger.fail(error)
        report.compatibility = structuredClone(CLIENT_LAB_COMPATIBILITY)
        report.diagnostics = paper?.diagnostics?.() ?? []
      }
    }

    try {
      await writeAtomically(validatedOptions.report, `${JSON.stringify(report, null, 2)}\n`)
      const diagnostics = (paper?.diagnostics?.() ?? []).slice(
        -CLIENT_LAB_COMPATIBILITY.maximumDiagnosticLines
      )
      await writeAtomically(join(reportDirectory, 'paper.log'), `${diagnostics.join('\n')}\n`)
    } finally {
      await rm(paperRoot, { recursive: true, force: true })
    }
  }

  return report
}

function validateOptions (options) {
  if (options === null || typeof options !== 'object') {
    throw new ClientLaboratoryError('invalid_options', 'Client Laboratory options are required')
  }
  for (const key of ['report', 'java', 'paperCache']) {
    if (typeof options[key] !== 'string' || options[key].trim() === '') {
      throw new ClientLaboratoryError('invalid_options', `${key} must be a nonblank path`)
    }
  }
  return {
    report: resolve(options.report),
    java: options.java,
    paperCache: resolve(options.paperCache)
  }
}

function cancelActiveBots (activeBots, cancelledBots) {
  for (const bot of activeBots) {
    if (cancelledBots.has(bot)) continue
    cancelledBots.add(bot)
    try {
      bot.quit?.('client laboratory peer failed')
    } catch {
      // The original laboratory error remains authoritative.
    }
  }
}

async function writeAtomically (destination, contents) {
  await mkdir(dirname(destination), { recursive: true })
  const temporary = `${destination}.${randomUUID()}.partial`
  try {
    await writeFile(temporary, contents, { encoding: 'utf8', flag: 'wx' })
    await rename(temporary, destination)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

async function reserveLoopbackPort () {
  const server = createServer()
  try {
    await new Promise((resolveListen, rejectListen) => {
      server.once('error', rejectListen)
      server.listen({ host: '127.0.0.1', port: 0 }, resolveListen)
    })
    const address = server.address()
    if (address === null || typeof address === 'string') {
      throw new ClientLaboratoryError('port_reservation_failed', 'loopback port reservation returned no port')
    }
    return address.port
  } finally {
    await new Promise((resolveClose) => server.close(() => resolveClose()))
  }
}

async function main () {
  const options = parseClientLaboratoryArgs(process.argv.slice(2))
  const report = await runClientLaboratory(options)
  if (report.outcome !== 'passed') process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`Client Laboratory failed before report publication: ${error.message}\n`)
    process.exitCode = 1
  })
}
