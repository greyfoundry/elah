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
import test from 'node:test'

import {
  ClientLaboratoryError,
  CLIENT_LAB_COMPATIBILITY
} from '../compatibility.mjs'
import {
  ClientLaboratoryLedger,
  REQUIRED_STAGES
} from '../ledger.mjs'

const literalStages = [
  'created',
  'connected',
  'logged_in',
  'spawned',
  'server_position_before',
  'movement_requested',
  'server_position_after',
  'disconnect_requested',
  'ended'
]

function completeSession (ledger, { sessionId, username, wave, offset = 0 }) {
  ledger.startSession({ sessionId, username, wave })
  ledger.record(sessionId, 'connected')
  ledger.record(sessionId, 'logged_in')
  ledger.record(sessionId, 'spawned')
  ledger.record(sessionId, 'server_position_before', { position: { x: offset, y: 64, z: offset } })
  ledger.record(sessionId, 'movement_requested', { direction: 'forward' })
  ledger.record(sessionId, 'server_position_after', { position: { x: offset + 1, y: 64, z: offset } })
  ledger.record(sessionId, 'disconnect_requested')
  ledger.record(sessionId, 'ended')
}

function completeRun () {
  let tick = 0
  const ledger = new ClientLaboratoryLedger({
    compatibility: CLIENT_LAB_COMPATIBILITY,
    now: () => ++tick
  })
  for (let wave = 1; wave <= 2; wave += 1) {
    for (let index = 1; index <= 16; index += 1) {
      const ordinal = (wave - 1) * 16 + index
      completeSession(ledger, {
        sessionId: `wave-${wave}-session-${String(index).padStart(3, '0')}`,
        username: `elah_lab_${String(ordinal).padStart(3, '0')}`,
        wave,
        offset: ordinal * 3
      })
    }
    ledger.completeWave(wave)
  }
  ledger.recordServerCleanup({ requested: true, exitCode: 0 })
  return ledger
}

test('requires the exact ordered lifecycle stages', () => {
  assert.deepEqual(REQUIRED_STAGES, literalStages)

  const ledger = new ClientLaboratoryLedger({
    compatibility: { ...CLIENT_LAB_COMPATIBILITY, waves: 1, concurrency: 1 },
    now: () => 10
  })
  completeSession(ledger, {
    sessionId: 'wave-1-session-001',
    username: 'elah_lab_001',
    wave: 1
  })

  const session = ledger.sessions[0]
  assert.deepEqual(session.stages.map((stage) => stage.name), literalStages)
  assert.equal(session.horizontalDisplacement, 1)
})

test('rejects missing, repeated, unknown, and reordered stages', () => {
  for (const operation of [
    (ledger) => ledger.record('s1', 'logged_in'),
    (ledger) => {
      ledger.record('s1', 'connected')
      ledger.record('s1', 'connected')
    },
    (ledger) => ledger.record('s1', 'made_up_stage')
  ]) {
    const ledger = new ClientLaboratoryLedger({
      compatibility: { ...CLIENT_LAB_COMPATIBILITY, waves: 1, concurrency: 1 }
    })
    ledger.startSession({ sessionId: 's1', username: 'elah_lab_001', wave: 1 })
    assert.throws(operation.bind(null, ledger), ClientLaboratoryError)
  }
})

test('rejects duplicate identities and invalid positions', () => {
  const ledger = new ClientLaboratoryLedger({
    compatibility: { ...CLIENT_LAB_COMPATIBILITY, waves: 1, concurrency: 2 }
  })
  ledger.startSession({ sessionId: 's1', username: 'elah_lab_001', wave: 1 })
  assert.throws(
    () => ledger.startSession({ sessionId: 's1', username: 'elah_lab_002', wave: 1 }),
    ClientLaboratoryError
  )
  assert.throws(
    () => ledger.startSession({ sessionId: 's2', username: 'elah_lab_001', wave: 1 }),
    ClientLaboratoryError
  )
  ledger.record('s1', 'connected')
  ledger.record('s1', 'logged_in')
  ledger.record('s1', 'spawned')
  assert.throws(
    () => ledger.record('s1', 'server_position_before', { position: { x: Infinity, y: 64, z: 0 } }),
    ClientLaboratoryError
  )
})

test('rejects server-observed movement below the fixed threshold', () => {
  const ledger = new ClientLaboratoryLedger({
    compatibility: { ...CLIENT_LAB_COMPATIBILITY, waves: 1, concurrency: 1 }
  })
  ledger.startSession({ sessionId: 's1', username: 'elah_lab_001', wave: 1 })
  ledger.record('s1', 'connected')
  ledger.record('s1', 'logged_in')
  ledger.record('s1', 'spawned')
  ledger.record('s1', 'server_position_before', { position: { x: 1, y: 64, z: 1 } })
  ledger.record('s1', 'movement_requested', { direction: 'forward' })
  assert.throws(
    () => ledger.record('s1', 'server_position_after', { position: { x: 1.49, y: 64, z: 1 } }),
    (error) => error instanceof ClientLaboratoryError && error.kind === 'insufficient_movement'
  )
})

test('finalizes only after 32 sessions, two waves, and clean server exit', () => {
  const report = completeRun().finalize()
  assert.equal(report.schema, 'elah.client-laboratory/v1')
  assert.equal(report.outcome, 'passed')
  assert.equal(report.requestedWaves, 2)
  assert.equal(report.completedWaves, 2)
  assert.equal(report.requestedSessions, 32)
  assert.equal(report.completedSessions, 32)
  assert.equal(report.serverCleanup.exitCode, 0)
  assert.equal(report.sessions.length, 32)
  assert.deepEqual(report.sessions[31].stages.map((stage) => stage.name), literalStages)

  const incomplete = new ClientLaboratoryLedger({ compatibility: CLIENT_LAB_COMPATIBILITY })
  assert.throws(() => incomplete.finalize(), ClientLaboratoryError)
})

test('uses a distinct bounded failure envelope', () => {
  const ledger = new ClientLaboratoryLedger({ compatibility: CLIENT_LAB_COMPATIBILITY })
  const report = ledger.fail(new ClientLaboratoryError('session_timeout', 'spawn timed out'))
  assert.deepEqual(report, {
    schema: 'elah.client-laboratory-error/v1',
    outcome: 'failed',
    error: {
      kind: 'session_timeout',
      summary: 'spawn timed out'
    }
  })
  assert.notEqual(report.schema, 'elah.client-laboratory/v1')
})
