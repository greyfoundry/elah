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

import { ClientLaboratoryError } from './compatibility.mjs'

export const REQUIRED_STAGES = Object.freeze([
  'created',
  'connected',
  'logged_in',
  'spawned',
  'server_position_before',
  'movement_requested',
  'server_position_after',
  'disconnect_requested',
  'ended'
])

export class ClientLaboratoryLedger {
  #compatibility
  #now
  #sessions = new Map()
  #usernames = new Set()
  #completedWaves = new Set()
  #serverCleanup
  #failed = false

  constructor ({ compatibility, now = Date.now }) {
    validateCompatibilityShape(compatibility)
    if (typeof now !== 'function') {
      throw new ClientLaboratoryError('invalid_ledger', 'ledger clock must be a function')
    }
    this.#compatibility = structuredClone(compatibility)
    this.#now = now
  }

  get sessions () {
    return [...this.#sessions.values()].map((session) => structuredClone(session))
  }

  startSession ({ sessionId, username, wave }) {
    this.#ensureActive()
    requireNonblank('sessionId', sessionId)
    requireNonblank('username', username)
    if (!Number.isSafeInteger(wave) || wave < 1 || wave > this.#compatibility.waves) {
      throw new ClientLaboratoryError('invalid_wave', `wave ${wave} is outside the configured range`)
    }
    if (this.#sessions.has(sessionId)) {
      throw new ClientLaboratoryError('duplicate_session', `session ID ${sessionId} is already present`)
    }
    if (this.#usernames.has(username)) {
      throw new ClientLaboratoryError('duplicate_username', `username ${username} is already present`)
    }

    const session = {
      sessionId,
      username,
      wave,
      stages: [{ name: 'created', atMillis: this.#timestamp() }],
      horizontalDisplacement: null
    }
    this.#sessions.set(sessionId, session)
    this.#usernames.add(username)
  }

  record (sessionId, stageName, data = {}) {
    this.#ensureActive()
    const session = this.#sessions.get(sessionId)
    if (!session) {
      throw new ClientLaboratoryError('unknown_session', `session ${sessionId} is not registered`)
    }
    const expected = REQUIRED_STAGES[session.stages.length]
    if (stageName !== expected) {
      throw new ClientLaboratoryError(
        'unexpected_stage',
        `session ${sessionId} expected ${expected ?? 'no further stage'} but received ${stageName}`
      )
    }

    const stage = { name: stageName, atMillis: this.#timestamp() }
    if (stageName === 'server_position_before' || stageName === 'server_position_after') {
      stage.position = checkedPosition(data.position)
    } else if (stageName === 'movement_requested') {
      if (!['forward', 'back', 'left', 'right'].includes(data.direction)) {
        throw new ClientLaboratoryError('invalid_direction', 'movement direction is not supported')
      }
      stage.direction = data.direction
    } else if (Object.keys(data).length > 0) {
      throw new ClientLaboratoryError('unexpected_stage_data', `${stageName} accepts no data`)
    }

    if (stageName === 'server_position_after') {
      const before = session.stages.find(({ name }) => name === 'server_position_before').position
      const displacement = Math.hypot(stage.position.x - before.x, stage.position.z - before.z)
      if (displacement < this.#compatibility.minimumHorizontalDisplacement) {
        throw new ClientLaboratoryError(
          'insufficient_movement',
          `server-observed horizontal displacement ${displacement.toFixed(3)} is below ${this.#compatibility.minimumHorizontalDisplacement}`
        )
      }
      session.horizontalDisplacement = displacement
    }

    session.stages.push(stage)
  }

  completeWave (wave) {
    this.#ensureActive()
    if (!Number.isSafeInteger(wave) || wave !== this.#completedWaves.size + 1) {
      throw new ClientLaboratoryError('unexpected_wave', `wave ${wave} cannot complete now`)
    }
    const sessions = [...this.#sessions.values()].filter((session) => session.wave === wave)
    if (
      sessions.length !== this.#compatibility.concurrency ||
      sessions.some((session) => session.stages.length !== REQUIRED_STAGES.length)
    ) {
      throw new ClientLaboratoryError('incomplete_wave', `wave ${wave} does not contain complete sessions`)
    }
    this.#completedWaves.add(wave)
  }

  recordServerCleanup ({ requested, exitCode }) {
    this.#ensureActive()
    if (requested !== true || exitCode !== 0) {
      throw new ClientLaboratoryError('server_cleanup_failed', 'server did not complete a requested clean exit')
    }
    if (this.#serverCleanup !== undefined) {
      throw new ClientLaboratoryError('duplicate_server_cleanup', 'server cleanup was already recorded')
    }
    this.#serverCleanup = {
      requested: true,
      exitCode: 0,
      atMillis: this.#timestamp()
    }
  }

  fail (error) {
    this.#failed = true
    const kind = error instanceof ClientLaboratoryError ? error.kind : 'laboratory_failed'
    const rawSummary = error instanceof Error ? error.message : String(error)
    return {
      schema: 'elah.client-laboratory-error/v1',
      outcome: 'failed',
      error: {
        kind,
        summary: rawSummary.slice(0, 500)
      }
    }
  }

  finalize () {
    this.#ensureActive()
    const requestedSessions = this.#compatibility.waves * this.#compatibility.concurrency
    const completedSessions = [...this.#sessions.values()]
      .filter((session) => session.stages.length === REQUIRED_STAGES.length)
      .length
    if (
      this.#completedWaves.size !== this.#compatibility.waves ||
      this.#sessions.size !== requestedSessions ||
      completedSessions !== requestedSessions ||
      this.#serverCleanup?.requested !== true ||
      this.#serverCleanup?.exitCode !== 0
    ) {
      throw new ClientLaboratoryError(
        'incomplete_laboratory',
        'laboratory cannot finalize before every session, wave, and server cleanup completes'
      )
    }

    return {
      schema: 'elah.client-laboratory/v1',
      outcome: 'passed',
      compatibility: structuredClone(this.#compatibility),
      requestedWaves: this.#compatibility.waves,
      completedWaves: this.#completedWaves.size,
      concurrency: this.#compatibility.concurrency,
      requestedSessions,
      completedSessions,
      serverCleanup: structuredClone(this.#serverCleanup),
      stageCounts: Object.fromEntries(REQUIRED_STAGES.map((stage) => [stage, requestedSessions])),
      sessions: this.sessions
    }
  }

  #ensureActive () {
    if (this.#failed) {
      throw new ClientLaboratoryError('laboratory_failed', 'ledger is already in a failed state')
    }
  }

  #timestamp () {
    const value = this.#now()
    if (!Number.isSafeInteger(value)) {
      throw new ClientLaboratoryError('invalid_timestamp', 'ledger clock returned an unsafe timestamp')
    }
    return value
  }
}

function validateCompatibilityShape (compatibility) {
  if (
    compatibility === null ||
    typeof compatibility !== 'object' ||
    !Number.isSafeInteger(compatibility.waves) ||
    compatibility.waves < 1 ||
    !Number.isSafeInteger(compatibility.concurrency) ||
    compatibility.concurrency < 1 ||
    !Number.isFinite(compatibility.minimumHorizontalDisplacement) ||
    compatibility.minimumHorizontalDisplacement <= 0
  ) {
    throw new ClientLaboratoryError('invalid_compatibility', 'ledger compatibility limits are invalid')
  }
}

function requireNonblank (field, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ClientLaboratoryError('invalid_identity', `${field} must be nonblank`)
  }
}

function checkedPosition (position) {
  if (
    position === null ||
    typeof position !== 'object' ||
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(position.z)
  ) {
    throw new ClientLaboratoryError('invalid_position', 'server position must contain finite x, y, and z values')
  }
  return { x: position.x, y: position.y, z: position.z }
}
