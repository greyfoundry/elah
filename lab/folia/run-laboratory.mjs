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

import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import { ClientLaboratoryError } from '../client/compatibility.mjs'
import { runFoliaClientBaseline } from './client-baseline.mjs'
import { FOLIA_BASELINE_COMPATIBILITY } from './compatibility.mjs'
import { downloadPinnedFolia } from './download-folia.mjs'
import {
  FoliaBaselineLedger,
  artifactReference,
  serializeJsonArtifact
} from './evidence.mjs'
import { FoliaLaboratory } from './folia.mjs'
import { runObserver } from './observer.mjs'
import { hashWorldTree } from './world-integrity.mjs'

const executeFile = promisify(execFile)
const OUTPUT_FILES = Object.freeze([
  'client-report.json',
  'observer-standard.json',
  'observer-deep.json',
  'world-before.json',
  'world-after.json',
  'folia.log'
])
const CLI_OPTIONS = new Map([
  ['--report', 'report'],
  ['--java', 'java'],
  ['--elah', 'elah'],
  ['--folia-cache', 'foliaCache']
])

export function parseFoliaBaselineArgs (args) {
  const options = {
    report: 'build/reports/folia-baseline/report.json',
    java: 'java',
    elah: process.platform === 'win32' ? 'target/debug/elah.exe' : 'target/debug/elah',
    foliaCache: 'build/cache/folia-baseline'
  }
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args
  const seen = new Set()
  for (let index = 0; index < normalizedArgs.length; index += 2) {
    const flag = normalizedArgs[index]
    const key = CLI_OPTIONS.get(flag)
    if (!key) throw new ClientLaboratoryError('unknown_option', `unknown option ${String(flag)}`)
    if (seen.has(flag)) throw new ClientLaboratoryError('duplicate_option', `option ${flag} was repeated`)
    const value = normalizedArgs[index + 1]
    if (typeof value !== 'string' || value.trim() === '' || value.startsWith('--')) {
      throw new ClientLaboratoryError('missing_option_value', `option ${flag} requires a value`)
    }
    options[key] = value
    seen.add(flag)
  }
  return options
}

export async function runFoliaBaseline (options, dependencyOverrides = {}) {
  const validated = validateOptions(options)
  const dependencies = {
    downloadFolia: downloadPinnedFolia,
    reservePort: reserveLoopbackPort,
    FoliaClass: FoliaLaboratory,
    runClientBaseline: runFoliaClientBaseline,
    runObserverImpl: runObserver,
    hashWorld: hashWorldTree,
    probeJavaMajor,
    now: Date.now,
    ...dependencyOverrides
  }
  validateDependencies(dependencies)

  const reportDirectory = dirname(validated.report)
  await mkdir(reportDirectory, { recursive: true })
  await clearKnownOutputs(reportDirectory, validated.report)
  const serverRoot = await mkdtemp(join(reportDirectory, '.folia-'))
  const serverJar = join(validated.foliaCache, FOLIA_BASELINE_COMPATIBILITY.artifactFile)
  const world = join(serverRoot, 'world')
  const ledger = new FoliaBaselineLedger({ compatibility: FOLIA_BASELINE_COMPATIBILITY })
  const totalStart = dependencies.now()
  const diagnostics = []
  let phase = 'download'
  let server
  let report
  let serverRootRemoved = false

  try {
    const downloadStart = dependencies.now()
    const artifact = await dependencies.downloadFolia({
      destination: serverJar,
      compatibility: FOLIA_BASELINE_COMPATIBILITY
    })
    const downloadMillis = elapsed(dependencies.now(), downloadStart)
    ledger.recordArtifact({
      file: FOLIA_BASELINE_COMPATIBILITY.artifactFile,
      bytes: artifact.bytes,
      sha256: artifact.sha256
    })
    phase = 'environment'
    ledger.recordEnvironment({
      os: process.platform,
      arch: process.arch,
      nodeVersion: process.versions.node,
      javaMajor: await dependencies.probeJavaMajor(validated.java)
    })

    phase = 'client'
    const clientStart = dependencies.now()
    const port = await dependencies.reservePort()
    server = new dependencies.FoliaClass({
      java: validated.java,
      root: serverRoot,
      jar: artifact.path,
      port,
      compatibility: FOLIA_BASELINE_COMPATIBILITY
    })
    const client = await dependencies.runClientBaseline({
      server,
      port,
      compatibility: FOLIA_BASELINE_COMPATIBILITY
    })
    const clientMillis = elapsed(dependencies.now(), clientStart)
    if (client?.outcome !== 'passed') throw clientFailure(client)
    const clientRef = artifactReference('client-report.json', client)
    ledger.recordClient(client, clientRef)
    diagnostics.push(...boundedServerDiagnostics(server))

    phase = 'world_before'
    const observerStart = dependencies.now()
    const before = await dependencies.hashWorld(world)
    phase = 'observer_standard'
    const standardResult = await dependencies.runObserverImpl({
      executable: validated.elah,
      world,
      deep: false
    })
    diagnostics.push(...diagnosticLines(standardResult.diagnostics))
    phase = 'observer_deep'
    const deepResult = await dependencies.runObserverImpl({
      executable: validated.elah,
      world,
      deep: true
    })
    diagnostics.push(...diagnosticLines(deepResult.diagnostics))
    phase = 'world_after'
    const after = await dependencies.hashWorld(world)
    const observerMillis = elapsed(dependencies.now(), observerStart)

    phase = 'cleanup'
    await rm(serverRoot, { recursive: true, force: true })
    serverRootRemoved = true

    const standardRef = artifactReference('observer-standard.json', standardResult.report)
    const deepRef = artifactReference('observer-deep.json', deepResult.report)
    const beforeRef = artifactReference('world-before.json', before)
    const afterRef = artifactReference('world-after.json', after)
    ledger.recordObservers({
      standard: standardResult.report,
      deep: deepResult.report,
      standardRef,
      deepRef
    })
    ledger.recordWorld({ before, after, beforeRef, afterRef })
    ledger.recordDurations({
      downloadMillis,
      clientMillis,
      observerMillis,
      totalMillis: elapsed(dependencies.now(), totalStart)
    })
    report = ledger.finalize()

    phase = 'publish'
    await writeJsonAtomically(join(reportDirectory, clientRef.path), client)
    await writeJsonAtomically(join(reportDirectory, standardRef.path), standardResult.report)
    await writeJsonAtomically(join(reportDirectory, deepRef.path), deepResult.report)
    await writeJsonAtomically(join(reportDirectory, beforeRef.path), before)
    await writeJsonAtomically(join(reportDirectory, afterRef.path), after)
    await writeLogAtomically(join(reportDirectory, 'folia.log'), diagnostics)
    await writeJsonAtomically(validated.report, report)
  } catch (error) {
    diagnostics.push(...boundedServerDiagnostics(server))
    if (!serverRootRemoved) {
      try {
        await rm(serverRoot, { recursive: true, force: true })
        serverRootRemoved = true
      } catch (cleanupError) {
        diagnostics.push(`Fixture cleanup failed: ${plainSummary(cleanupError)}`)
      }
    }
    report = ledger.fail(error, { phase, diagnosticRef: 'folia.log' })
    await clearEvidenceOutputs(reportDirectory)
    await writeLogAtomically(join(reportDirectory, 'folia.log'), diagnostics)
    await writeJsonAtomically(validated.report, report)
  } finally {
    if (!serverRootRemoved) await rm(serverRoot, { recursive: true, force: true }).catch(() => {})
  }
  return report
}

function validateOptions (options) {
  if (options === null || typeof options !== 'object') {
    throw new ClientLaboratoryError('invalid_options', 'Folia Baseline Laboratory options are required')
  }
  for (const key of ['report', 'java', 'elah', 'foliaCache']) {
    if (typeof options[key] !== 'string' || options[key].trim() === '') {
      throw new ClientLaboratoryError('invalid_options', `${key} must be nonblank`)
    }
  }
  return {
    report: resolve(options.report),
    java: options.java,
    elah: resolve(options.elah),
    foliaCache: resolve(options.foliaCache)
  }
}

function validateDependencies (dependencies) {
  for (const key of [
    'downloadFolia',
    'reservePort',
    'FoliaClass',
    'runClientBaseline',
    'runObserverImpl',
    'hashWorld',
    'probeJavaMajor',
    'now'
  ]) {
    if (typeof dependencies[key] !== 'function') {
      throw new ClientLaboratoryError('invalid_adapter', `${key} adapter must be a function`)
    }
  }
}

function clientFailure (report) {
  const error = new ClientLaboratoryError(
    report?.error?.kind ?? 'client_evidence_failed',
    report?.error?.summary ?? 'Folia client evidence did not pass'
  )
  return error
}

function elapsed (end, start) {
  const value = end - start
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ClientLaboratoryError('invalid_duration', 'Laboratory clock produced an invalid duration')
  }
  return value
}

async function clearKnownOutputs (directory, report) {
  await Promise.all([
    ...OUTPUT_FILES.map((file) => rm(join(directory, file), { force: true })),
    rm(report, { force: true })
  ])
}

async function clearEvidenceOutputs (directory) {
  await Promise.all(OUTPUT_FILES.slice(0, 5).map((file) => rm(join(directory, file), { force: true })))
}

async function writeJsonAtomically (destination, value) {
  await writeAtomically(destination, serializeJsonArtifact(value))
}

async function writeLogAtomically (destination, lines) {
  const bounded = lines.slice(-FOLIA_BASELINE_COMPATIBILITY.maximumDiagnosticLines)
    .map((line) => String(line).replace(/[\r\n]+/g, ' ').slice(0, 2000))
  await writeAtomically(destination, bounded.length > 0 ? `${bounded.join('\n')}\n` : '')
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

function boundedServerDiagnostics (server) {
  try {
    const lines = server?.diagnostics?.()
    return Array.isArray(lines) ? lines : []
  } catch {
    return ['Server diagnostics were unavailable']
  }
}

function plainSummary (error) {
  return (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, ' ').slice(0, 500)
}

function diagnosticLines (value) {
  return typeof value === 'string' ? value.split(/\r?\n/).filter(Boolean) : []
}

async function reserveLoopbackPort () {
  const socket = createServer()
  try {
    await new Promise((resolveListen, rejectListen) => {
      socket.once('error', rejectListen)
      socket.listen({ host: '127.0.0.1', port: 0 }, resolveListen)
    })
    const address = socket.address()
    if (address === null || typeof address === 'string') {
      throw new ClientLaboratoryError('port_reservation_failed', 'Loopback port reservation returned no port')
    }
    return address.port
  } finally {
    await new Promise((resolveClose) => socket.close(() => resolveClose()))
  }
}

async function probeJavaMajor (java) {
  let result
  try {
    result = await executeFile(java, ['-version'], {
      shell: false,
      windowsHide: true,
      encoding: 'utf8',
      maxBuffer: 64 * 1024
    })
  } catch (error) {
    if (typeof error?.stderr !== 'string') throw error
    result = error
  }
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  const match = output.match(/version "(?:1\.)?([0-9]+)/)
  const major = Number(match?.[1])
  if (!Number.isSafeInteger(major) || major < 21) {
    throw new ClientLaboratoryError('java_version', 'Folia Baseline Laboratory requires Java 21 or newer')
  }
  return major
}

async function main () {
  const options = parseFoliaBaselineArgs(process.argv.slice(2))
  const report = await runFoliaBaseline(options)
  if (report.outcome !== 'passed') process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`Folia Baseline Laboratory failed before report publication: ${error.message}\n`)
    process.exitCode = 1
  })
}
