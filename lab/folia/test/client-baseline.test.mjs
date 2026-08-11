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
import test from 'node:test'

import { FOLIA_BASELINE_COMPATIBILITY } from '../compatibility.mjs'
import { runFoliaClientBaseline } from '../client-baseline.mjs'

class FakeFolia {
  constructor ({ failStop = false } = {}) {
    this.events = []
    this.failStop = failStop
  }

  async start () {
    this.events.push('start')
  }

  async queryPosition () {
    throw new Error('session double owns position evidence')
  }

  async stop () {
    this.events.push('stop')
    if (this.failStop) throw new Error('Folia clean shutdown failed')
    return { requested: true, exitCode: 0, signal: null }
  }

  diagnostics () {
    return ['bounded Folia diagnostic']
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
    active -= 1
  }
}

test('runs two sequential waves of 16 and stops Folia before passing', async () => {
  const server = new FakeFolia()
  const observations = { maximumActive: 0, started: [], directions: [] }
  const report = await runFoliaClientBaseline({
    server,
    port: 25570,
    compatibility: FOLIA_BASELINE_COMPATIBILITY,
    runSession: successfulSessionDouble(observations),
    botFactory: () => { throw new Error('real bot must not be created') }
  })
  assert.equal(report.schema, 'elah.client-laboratory/v1')
  assert.equal(report.outcome, 'passed')
  assert.equal(report.completedSessions, 32)
  assert.equal(report.completedWaves, 2)
  assert.equal(observations.maximumActive, 16)
  assert.equal(observations.started[15], 'session-016')
  assert.equal(observations.started[16], 'session-017')
  assert.deepEqual(observations.directions.slice(0, 8), [
    'forward', 'right', 'back', 'left', 'forward', 'right', 'back', 'left'
  ])
  assert.deepEqual(server.events, ['start', 'stop'])
})

test('the first rejected session cancels peers and still requests shutdown', async () => {
  const server = new FakeFolia()
  const bots = []
  const report = await runFoliaClientBaseline({
    server,
    port: 25570,
    compatibility: FOLIA_BASELINE_COMPATIBILITY,
    botFactory: () => bots.at(-1),
    runSession: async ({ sessionId, botFactory }) => {
      const bot = new EventEmitter()
      bot.quitCalls = 0
      bot.quit = () => {
        bot.quitCalls += 1
        bot.emit('end')
      }
      bots.push(bot)
      botFactory({})
      if (sessionId === 'session-003') throw new Error('first Folia session failure')
      await new Promise((resolve) => bot.once('end', resolve))
    }
  })
  assert.equal(report.schema, 'elah.client-laboratory-error/v1')
  assert.equal(report.outcome, 'failed')
  assert.match(report.error.summary, /first Folia session failure/)
  assert.equal(bots.filter((bot) => bot.quitCalls === 1).length, 16)
  assert.deepEqual(server.events, ['start', 'stop'])
})

test('a clean-shutdown failure prevents passing client evidence', async () => {
  const server = new FakeFolia({ failStop: true })
  const observations = { maximumActive: 0, started: [], directions: [] }
  const report = await runFoliaClientBaseline({
    server,
    port: 25570,
    compatibility: FOLIA_BASELINE_COMPATIBILITY,
    runSession: successfulSessionDouble(observations),
    botFactory: () => { throw new Error('real bot must not be created') }
  })
  assert.equal(report.outcome, 'failed')
  assert.match(report.error.summary, /clean shutdown failed/i)
})

test('rejects a changed compatibility tuple before starting Folia', async () => {
  const server = new FakeFolia()
  await assert.rejects(runFoliaClientBaseline({
    server,
    port: 25570,
    compatibility: { ...FOLIA_BASELINE_COMPATIBILITY, waves: 1 }
  }), /pinned Folia 1\.21\.8 build 6/i)
  assert.deepEqual(server.events, [])
})
