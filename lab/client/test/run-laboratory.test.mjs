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
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { parseClientLaboratoryArgs, runClientLaboratory } from '../run-laboratory.mjs'

class FakePaper {
  static failStop = false
  static events = []

  async start () {
    FakePaper.events.push('paper:start')
  }

  async queryPosition () {
    throw new Error('session double owns position evidence')
  }

  async stop () {
    FakePaper.events.push('paper:stop')
    if (FakePaper.failStop) throw new Error('Paper cleanup failed')
    return { requested: true, exitCode: 0 }
  }

  diagnostics () {
    return ['bounded fixture diagnostic']
  }
}

async function withOptions (run) {
  const root = await mkdtemp(join(tmpdir(), 'elah-client-runner-'))
  const options = {
    report: join(root, 'reports', 'report.json'),
    java: 'java',
    paperCache: join(root, 'cache')
  }
  FakePaper.failStop = false
  FakePaper.events = []
  try {
    await run({ root, options })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function successfulSessionDouble (observations) {
  let active = 0
  return async ({ sessionId, direction, ledger }) => {
    active += 1
    observations.maximumActive = Math.max(observations.maximumActive, active)
    observations.started.push(sessionId)
    observations.directions.push(direction)
    ledger.record(sessionId, 'connected')
    ledger.record(sessionId, 'logged_in')
    ledger.record(sessionId, 'spawned')
    ledger.record(sessionId, 'server_position_before', { position: { x: 0, y: 64, z: 0 } })
    ledger.record(sessionId, 'movement_requested', { direction })
    await new Promise((resolve) => setImmediate(resolve))
    ledger.record(sessionId, 'server_position_after', { position: { x: 1, y: 64, z: 0 } })
    ledger.record(sessionId, 'disconnect_requested')
    ledger.record(sessionId, 'ended')
    observations.ended.push(sessionId)
    active -= 1
  }
}

function dependencies (runSession) {
  return {
    downloadPaper: async ({ destination }) => ({ path: destination, sha256: 'verified', bytes: 1 }),
    PaperClass: FakePaper,
    reservePort: async () => 25570,
    runSession,
    botFactory: () => { throw new Error('unexpected real bot construction') }
  }
}

test('runs two sequential waves of 16 sessions and finalizes after cleanup', async () => {
  await withOptions(async ({ options }) => {
    const observations = { maximumActive: 0, started: [], ended: [], directions: [] }
    const report = await runClientLaboratory(options, dependencies(successfulSessionDouble(observations)))

    assert.equal(report.outcome, 'passed')
    assert.equal(report.requestedWaves, 2)
    assert.equal(report.completedWaves, 2)
    assert.equal(report.requestedSessions, 32)
    assert.equal(report.completedSessions, 32)
    assert.equal(observations.maximumActive, 16)
    assert.deepEqual(observations.started.slice(0, 16), Array.from({ length: 16 }, (_, index) => `session-${String(index + 1).padStart(3, '0')}`))
    assert.deepEqual(observations.started.slice(16), Array.from({ length: 16 }, (_, index) => `session-${String(index + 17).padStart(3, '0')}`))
    assert.equal(observations.ended.indexOf('session-016') < observations.started.indexOf('session-017'), true)
    assert.deepEqual(observations.directions.slice(0, 8), [
      'forward', 'right', 'back', 'left', 'forward', 'right', 'back', 'left'
    ])
    assert.deepEqual(FakePaper.events, ['paper:start', 'paper:stop'])
    assert.deepEqual(JSON.parse(await readFile(options.report, 'utf8')), report)
    assert.equal((await readdir(join(options.report, '..'))).some((name) => name.endsWith('.partial')), false)
  })
})

test('one rejected session disconnects peers, stops Paper, and writes failure evidence', async () => {
  await withOptions(async ({ options }) => {
    const bots = []
    const runSession = async ({ sessionId, botFactory }) => {
      const bot = new EventEmitter()
      bot.quitCalls = 0
      bot.quit = () => {
        bot.quitCalls += 1
        bot.emit('end')
      }
      bots.push(bot)
      botFactory = botFactory ?? (() => bot)
      botFactory({})
      if (sessionId === 'session-003') throw new Error('client 003 rejected')
      await new Promise((resolve) => bot.once('end', resolve))
    }
    const deps = dependencies(runSession)
    deps.botFactory = () => bots.at(-1)

    const report = await runClientLaboratory(options, deps)

    assert.equal(report.outcome, 'failed')
    assert.match(report.error.summary, /client 003 rejected/i)
    assert.equal(bots.filter((bot) => bot.quitCalls === 1).length, 16)
    assert.deepEqual(FakePaper.events, ['paper:start', 'paper:stop'])
    assert.equal(JSON.parse(await readFile(options.report, 'utf8')).outcome, 'failed')
  })
})

test('preserves the first causal session error instead of a later peer error', async () => {
  await withOptions(async ({ options }) => {
    const runSession = async ({ sessionId }) => {
      if (sessionId === 'session-003') throw new Error('first causal failure')
      await new Promise((resolve) => setImmediate(resolve))
      if (sessionId === 'session-001') throw new Error('secondary peer failure')
    }

    const report = await runClientLaboratory(options, dependencies(runSession))

    assert.equal(report.outcome, 'failed')
    assert.match(report.error.summary, /first causal failure/i)
    assert.doesNotMatch(report.error.summary, /secondary peer failure/i)
  })
})

test('Paper cleanup failure prevents passed evidence', async () => {
  await withOptions(async ({ options }) => {
    FakePaper.failStop = true
    const observations = { maximumActive: 0, started: [], ended: [], directions: [] }

    const report = await runClientLaboratory(options, dependencies(successfulSessionDouble(observations)))

    assert.equal(report.outcome, 'failed')
    assert.match(report.error.summary, /cleanup failed/i)
  })
})

test('CLI accepts only report, java, and paper-cache values', () => {
  assert.deepEqual(parseClientLaboratoryArgs([
    '--report', 'out/report.json', '--java', '/jdk/bin/java', '--paper-cache', 'cache'
  ]), {
    report: 'out/report.json',
    java: '/jdk/bin/java',
    paperCache: 'cache'
  })
  assert.throws(() => parseClientLaboratoryArgs(['--unknown', 'value']), /unknown option/i)
  assert.throws(() => parseClientLaboratoryArgs(['--report']), /requires a value/i)
  assert.throws(() => parseClientLaboratoryArgs(['--concurrency', '1']), /unknown option/i)
  assert.throws(() => parseClientLaboratoryArgs(['--minecraft-version', '26.2']), /unknown option/i)
})

test('CLI accepts one standard option separator but rejects repeated separators', () => {
  assert.deepEqual(parseClientLaboratoryArgs(['--', '--report', 'out/report.json']), {
    report: 'out/report.json',
    java: 'java',
    paperCache: 'build/cache/client-laboratory'
  })
  assert.throws(() => parseClientLaboratoryArgs(['--', '--', '--report', 'out/report.json']), /unknown option/i)
})
