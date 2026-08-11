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

import { ClientLaboratoryError } from '../client/compatibility.mjs'
import { ClientLaboratoryLedger } from '../client/ledger.mjs'
import { runClientSession } from '../client/session.mjs'
import { assertPinnedFoliaSource } from './compatibility.mjs'

const directions = Object.freeze(['forward', 'right', 'back', 'left'])

export async function runFoliaClientBaseline ({
  server,
  port,
  compatibility,
  botFactory,
  runSession = runClientSession
}) {
  assertPinnedFoliaSource(compatibility)
  validateBoundary(server, port, runSession)
  const ledger = new ClientLaboratoryLedger({ compatibility })
  const activeBots = new Set()
  const cancelledBots = new WeakSet()
  let primaryError
  let cleanupError
  let startAttempted = false
  let readyObserved = false
  let cleanupResult

  try {
    startAttempted = true
    await server.start()
    readyObserved = true
    let realBotFactory = botFactory
    if (!realBotFactory) {
      const mineflayer = await import('mineflayer')
      realBotFactory = mineflayer.createBot ?? mineflayer.default?.createBot
    }
    if (typeof realBotFactory !== 'function') {
      throw new ClientLaboratoryError('mineflayer_unavailable', 'Mineflayer did not expose createBot')
    }
    const trackingBotFactory = (options) => {
      const bot = realBotFactory(options)
      activeBots.add(bot)
      if (typeof bot?.once === 'function') bot.once('end', () => activeBots.delete(bot))
      return bot
    }

    for (let wave = 1; wave <= compatibility.waves; wave += 1) {
      const sessions = []
      let waveFailure
      for (let offset = 0; offset < compatibility.concurrency; offset += 1) {
        const ordinal = (wave - 1) * compatibility.concurrency + offset + 1
        const suffix = String(ordinal).padStart(3, '0')
        const sessionId = `session-${suffix}`
        const username = `elah_lab_${suffix}`
        const direction = directions[(ordinal - 1) % directions.length]
        ledger.startSession({ sessionId, username, wave })
        const session = runSession({
          sessionId,
          username,
          endpoint: { host: '127.0.0.1', port },
          version: compatibility.minecraftVersion,
          direction,
          botFactory: trackingBotFactory,
          positionProbe: (name, bot) => server.queryPosition(name, bot),
          ledger
        }).catch((error) => {
          waveFailure ??= error
          cancelActiveBots(activeBots, cancelledBots)
          throw error
        })
        sessions.push(session)
      }
      const results = await Promise.allSettled(sessions)
      const failed = results.find(({ status }) => status === 'rejected')
      if (failed) throw waveFailure ?? failed.reason
      ledger.completeWave(wave)
    }
  } catch (error) {
    primaryError = error
    cancelActiveBots(activeBots, cancelledBots)
  } finally {
    if (startAttempted) {
      try {
        cleanupResult = await server.stop()
        if (!primaryError) ledger.recordServerCleanup(cleanupResult)
      } catch (error) {
        if (!primaryError) primaryError = error
        else cleanupError = error
      }
    }
  }

  if (primaryError) {
    const report = ledger.fail(primaryError)
    report.compatibility = structuredClone(compatibility)
    report.diagnostics = server.diagnostics()
    report.fixtureLifecycle = fixtureLifecycle(readyObserved, cleanupResult)
    if (cleanupError) report.cleanupDiagnostic = boundedSummary(cleanupError)
    return report
  }
  try {
    const report = ledger.finalize()
    report.fixtureLifecycle = fixtureLifecycle(readyObserved, cleanupResult)
    return report
  } catch (error) {
    const report = ledger.fail(error)
    report.compatibility = structuredClone(compatibility)
    report.diagnostics = server.diagnostics()
    report.fixtureLifecycle = fixtureLifecycle(readyObserved, cleanupResult)
    return report
  }
}

function validateBoundary (server, port, runSession) {
  if (
    typeof server?.start !== 'function' ||
    typeof server?.stop !== 'function' ||
    typeof server?.queryPosition !== 'function' ||
    typeof server?.diagnostics !== 'function'
  ) {
    throw new ClientLaboratoryError('invalid_folia_adapter', 'Folia server adapter is incomplete')
  }
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new ClientLaboratoryError('invalid_endpoint', 'Folia port must be between 1 and 65535')
  }
  if (typeof runSession !== 'function') {
    throw new ClientLaboratoryError('invalid_folia_adapter', 'Folia session adapter is incomplete')
  }
}

function cancelActiveBots (activeBots, cancelledBots) {
  for (const bot of activeBots) {
    if (cancelledBots.has(bot)) continue
    cancelledBots.add(bot)
    try {
      const disconnect = typeof bot.quit === 'function' ? bot.quit.bind(bot) : bot.end?.bind(bot)
      disconnect?.('Folia baseline peer failed')
    } catch {
      // The first causal laboratory error remains authoritative.
    }
  }
}

function boundedSummary (error) {
  return (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, ' ').slice(0, 500)
}

function fixtureLifecycle (readyObserved, cleanup) {
  return {
    readyObserved,
    cleanStopRequested: cleanup?.requested === true,
    exitCode: Number.isSafeInteger(cleanup?.exitCode) ? cleanup.exitCode : null,
    signal: typeof cleanup?.signal === 'string' ? cleanup.signal : null
  }
}
