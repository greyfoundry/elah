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

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { REQUIRED_STAGES } from '../../client/ledger.mjs'
import { FOLIA_BASELINE_COMPATIBILITY } from '../compatibility.mjs'
import { parseFoliaBaselineArgs, runFoliaBaseline } from '../run-laboratory.mjs'
import { verifyFoliaBaselineReport } from '../verify-report.mjs'

function passingClient () {
  return {
    schema: 'elah.client-laboratory/v1',
    outcome: 'passed',
    compatibility: structuredClone(FOLIA_BASELINE_COMPATIBILITY),
    requestedWaves: 2,
    completedWaves: 2,
    concurrency: 16,
    requestedSessions: 32,
    completedSessions: 32,
    serverCleanup: { requested: true, exitCode: 0, atMillis: 1 },
    fixtureLifecycle: { readyObserved: true, cleanStopRequested: true, exitCode: 0, signal: null },
    stageCounts: Object.fromEntries(REQUIRED_STAGES.map((stage) => [stage, 32])),
    sessions: Array.from({ length: 32 }, (_, index) => ({
      sessionId: `session-${String(index + 1).padStart(3, '0')}`,
      username: `elah_lab_${String(index + 1).padStart(3, '0')}`,
      wave: index < 16 ? 1 : 2,
      horizontalDisplacement: 1,
      stages: REQUIRED_STAGES.map((name, atMillis) => ({ name, atMillis }))
    }))
  }
}

function observer (depth) {
  return {
    schema: 'elah.observe/v1',
    observer_version: '0.0.5',
    scan: { depth, consistent: true, content_nbt_decoded: depth === 'deep' }
  }
}

class FakeFolia {
  constructor (options) {
    Object.assign(this, options)
  }

  diagnostics () {
    return ['Folia bounded log']
  }
}

async function withOutput (run) {
  const root = await mkdtemp(join(tmpdir(), 'elah-folia-runner-'))
  try {
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function dependencies (events, overrides = {}) {
  return {
    downloadFolia: async () => {
      events.push('download')
      return {
        path: 'pinned-folia.jar',
        sha256: FOLIA_BASELINE_COMPATIBILITY.artifactSha256,
        bytes: FOLIA_BASELINE_COMPATIBILITY.artifactBytes
      }
    },
    reservePort: async () => 25570,
    FoliaClass: FakeFolia,
    runClientBaseline: async ({ server }) => {
      events.push('client')
      await mkdir(join(server.root, 'world', 'region'), { recursive: true })
      await writeFile(join(server.root, 'world', 'level.dat'), 'level')
      await writeFile(join(server.root, 'world', 'region', 'r.0.0.mca'), 'region')
      return passingClient()
    },
    runObserverImpl: async ({ deep }) => {
      events.push(deep ? 'observer-deep' : 'observer-standard')
      return { report: observer(deep ? 'deep' : 'standard'), diagnostics: `${deep ? 'deep' : 'standard'} notice\n` }
    },
    probeJavaMajor: async () => 21,
    now: (() => {
      let value = 100
      return () => value++
    })(),
    ...overrides
  }
}

test('publishes the complete bundle last after stopped-world Observer passes', async () => {
  await withOutput(async (root) => {
    const events = []
    const reportPath = join(root, 'report.json')
    const report = await runFoliaBaseline({
      report: reportPath,
      java: 'java',
      elah: 'target/debug/elah',
      foliaCache: join(root, 'cache')
    }, dependencies(events))
    assert.equal(report.outcome, 'passed')
    assert.deepEqual(events, ['download', 'client', 'observer-standard', 'observer-deep'])
    const files = (await readdir(root)).sort()
    assert.deepEqual(files, [
      'client-report.json',
      'folia.log',
      'observer-deep.json',
      'observer-standard.json',
      'report.json',
      'world-after.json',
      'world-before.json'
    ])
    const published = JSON.parse(await readFile(reportPath, 'utf8'))
    assert.equal(published.worldIntegrity.unchanged, true)
    assert.match(await readFile(join(root, 'folia.log'), 'utf8'), /Folia bounded log/)
    await assert.doesNotReject(verifyFoliaBaselineReport(reportPath))
    const clientPath = join(root, 'client-report.json')
    const client = JSON.parse(await readFile(clientPath, 'utf8'))
    client.completedSessions = 31
    await writeFile(clientPath, `${JSON.stringify(client, null, 2)}\n`)
    await assert.rejects(verifyFoliaBaselineReport(reportPath), /client evidence|session|digest/i)
  })
})

test('publishes only a fail-closed report and bounded log after client failure', async () => {
  await withOutput(async (root) => {
    const events = []
    const report = await runFoliaBaseline({
      report: join(root, 'report.json'),
      java: 'java',
      elah: 'target/debug/elah',
      foliaCache: join(root, 'cache')
    }, dependencies(events, {
      runClientBaseline: async () => ({
        schema: 'elah.client-laboratory-error/v1',
        outcome: 'failed',
        error: { kind: 'session_failed', summary: 'player session did not complete' }
      })
    }))
    assert.equal(report.schema, 'elah.folia-baseline-error/v1')
    assert.equal(report.error.kind, 'session_failed')
    assert.deepEqual(events, ['download'])
    assert.deepEqual((await readdir(root)).sort(), ['folia.log', 'report.json'])
  })
})

test('never invokes Observer when nominal client evidence lacks clean shutdown proof', async () => {
  await withOutput(async (root) => {
    const events = []
    const dirty = passingClient()
    dirty.fixtureLifecycle.cleanStopRequested = false
    const report = await runFoliaBaseline({
      report: join(root, 'report.json'),
      java: 'java',
      elah: 'target/debug/elah',
      foliaCache: join(root, 'cache')
    }, dependencies(events, {
      runClientBaseline: async ({ server }) => {
        events.push('client')
        await mkdir(join(server.root, 'world'), { recursive: true })
        await writeFile(join(server.root, 'world', 'level.dat'), 'level')
        return dirty
      }
    }))
    assert.equal(report.outcome, 'failed')
    assert.deepEqual(events, ['download', 'client'])
  })
})

test('parses exact CLI options and rejects duplicate or unknown flags', () => {
  assert.deepEqual(parseFoliaBaselineArgs([
    '--report', 'out.json',
    '--java', 'java21',
    '--elah', 'elah-cli',
    '--folia-cache', 'cache'
  ]), {
    report: 'out.json',
    java: 'java21',
    elah: 'elah-cli',
    foliaCache: 'cache'
  })
  assert.throws(() => parseFoliaBaselineArgs(['--java', 'one', '--java', 'two']), /repeated/i)
  assert.throws(() => parseFoliaBaselineArgs(['--unknown', 'value']), /unknown/i)
})
