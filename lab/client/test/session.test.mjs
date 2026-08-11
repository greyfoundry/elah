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

import { CLIENT_LAB_COMPATIBILITY } from '../compatibility.mjs'
import { ClientLaboratoryLedger } from '../ledger.mjs'
import { runClientSession } from '../session.mjs'

class FakeBot extends EventEmitter {
  constructor ({ version = '1.21.8', terminal = 'end', failureAt = null, automaticPhysicsTick = true } = {}) {
    super()
    this.version = version
    this.terminal = terminal
    this.failureAt = failureAt
    this.automaticPhysicsTick = automaticPhysicsTick
    this.controls = new Map()
    this.controlCalls = []
    this.packetWrites = []
    this.quitCalls = []
    this.clearCalls = 0
    this._client = {
      write: (name, payload) => this.packetWrites.push([name, payload])
    }
  }

  start () {
    this.#emitStage('connect', () => {
      setImmediate(() => this.#emitStage('login', () => {
        setImmediate(() => this.#emitStage('spawn', () => {
          if (this.automaticPhysicsTick) setImmediate(() => this.physicsTick())
        }))
      }))
    })
  }

  physicsTick () {
    this.emit('physicsTick')
    this.emit('move')
  }

  setControlState (direction, enabled) {
    this.controls.set(direction, enabled)
    this.controlCalls.push([direction, enabled])
  }

  clearControlStates () {
    this.clearCalls += 1
    for (const direction of ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak']) {
      this.controls.set(direction, false)
    }
  }

  quit (reason) {
    this.quitCalls.push(reason)
    if (this.terminal === 'missing') return
    setImmediate(() => {
      if (this.terminal === 'error') this.emit('error', new Error('socket broke'))
      else if (this.terminal === 'kicked') this.emit('kicked', 'fixture rejection')
      else this.emit('end', 'client laboratory complete')
    })
  }

  #emitStage (stage, next = () => {}) {
    if (this.failureAt === stage) {
      this.emit('kicked', `kicked before ${stage}`)
      return
    }
    this.emit(stage)
    next()
  }
}

function buildHarness (botOptions = {}, overrides = {}) {
  const ledger = new ClientLaboratoryLedger({
    compatibility: CLIENT_LAB_COMPATIBILITY,
    now: (() => {
      let tick = 0
      return () => ++tick
    })()
  })
  ledger.startSession({ sessionId: 'session-001', username: 'elah_lab_001', wave: 1 })

  const bot = new FakeBot(botOptions)
  const factoryOptions = []
  const positions = [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }]
  const probes = []
  let timeoutCall = 0
  const timers = {
    delay: async () => {
      if (overrides.failureDuringMovement) bot.emit('kicked', 'kicked during movement')
    },
    setTimeout: overrides.timeoutAt
      ? (callback, milliseconds) => {
          timeoutCall += 1
          if (timeoutCall !== overrides.timeoutAt) return setTimeout(callback, milliseconds)
          queueMicrotask(callback)
          return Symbol('timer')
        }
      : setTimeout,
    clearTimeout: (timer) => {
      if (typeof timer !== 'symbol') clearTimeout(timer)
    }
  }

  return {
    bot,
    ledger,
    factoryOptions,
    probes,
    run: () => runClientSession({
      sessionId: 'session-001',
      username: 'elah_lab_001',
      endpoint: overrides.endpoint ?? { host: '127.0.0.1', port: 25565 },
      version: overrides.version ?? '1.21.8',
      direction: overrides.direction ?? 'forward',
      botFactory: (options) => {
        factoryOptions.push(options)
        setImmediate(() => bot.start())
        return bot
      },
      positionProbe: async (username) => {
        probes.push(username)
        if (overrides.probeError) throw new Error('Paper position probe failed')
        return positions.shift()
      },
      ledger,
      timers
    })
  }
}

test('records the real event, server position, movement, and terminal sequence', async () => {
  const harness = buildHarness()

  await harness.run()

  assert.deepEqual(
    harness.ledger.sessions[0].stages.map(({ name }) => name),
    [
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
  )
  assert.deepEqual(harness.probes, ['elah_lab_001', 'elah_lab_001'])
  assert.deepEqual(harness.bot.controlCalls, [['forward', true], ['forward', false]])
  assert.deepEqual(harness.bot.packetWrites, [
    ['tick_end', {}],
    ['player_input', { inputs: {
      forward: true,
      backward: false,
      left: false,
      right: false,
      jump: false,
      shift: false,
      sprint: false
    } }],
    ['player_input', { inputs: {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      shift: false,
      sprint: false
    } }]
  ])
  assert.deepEqual(harness.bot.quitCalls, ['client laboratory complete'])
  assert.equal(harness.bot.clearCalls, 1)
  assert.equal([...harness.bot.controls.values()].every((enabled) => enabled === false), true)
  assert.deepEqual(harness.factoryOptions, [{
    host: '127.0.0.1',
    port: 25565,
    username: 'elah_lab_001',
    auth: 'offline',
    version: '1.21.8',
    hideErrors: true,
    checkTimeoutInterval: 30_000
  }])
  assert.deepEqual(harness.bot.eventNames(), [])
})

test('uses Paper observations instead of the Mineflayer local position', async () => {
  const harness = buildHarness()
  harness.bot.entity = { position: { x: 10_000, y: 0, z: 10_000 } }

  await harness.run()

  assert.deepEqual(
    harness.ledger.sessions[0].stages
      .filter(({ position }) => position)
      .map(({ position }) => position),
    [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }]
  )
})

test('waits for Mineflayer physics readiness before sampling or requesting movement', async () => {
  const harness = buildHarness({ automaticPhysicsTick: false })
  const running = harness.run()

  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(harness.probes, [])
  assert.deepEqual(harness.bot.controlCalls, [])

  harness.bot.physicsTick()
  await running

  assert.deepEqual(harness.probes, ['elah_lab_001', 'elah_lab_001'])
  assert.deepEqual(harness.bot.controlCalls, [['forward', true], ['forward', false]])
})

test('waits for Mineflayer plugin injection before requiring session controls', async () => {
  const ledger = new ClientLaboratoryLedger({ compatibility: CLIENT_LAB_COMPATIBILITY, now: () => 1 })
  ledger.startSession({ sessionId: 'session-001', username: 'elah_lab_001', wave: 1 })
  const bot = new EventEmitter()
  bot.version = '1.21.8'
  bot.controls = []
  bot._client = { write: () => {} }

  await runClientSession({
    sessionId: 'session-001',
    username: 'elah_lab_001',
    endpoint: { host: '127.0.0.1', port: 25565 },
    version: '1.21.8',
    direction: 'forward',
    botFactory: () => {
      setImmediate(() => {
        bot.setControlState = (direction, enabled) => bot.controls.push([direction, enabled])
        bot.clearControlStates = () => {}
        bot.quit = () => setImmediate(() => bot.emit('end'))
        bot.emit('inject_allowed')
        setImmediate(() => {
          bot.emit('connect')
          setImmediate(() => {
            bot.emit('login')
            setImmediate(() => {
              bot.emit('spawn')
              setImmediate(() => {
                bot.emit('physicsTick')
                bot.emit('move')
              })
            })
          })
        })
      })
      return bot
    },
    positionProbe: (() => {
      const positions = [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }]
      return async () => positions.shift()
    })(),
    ledger,
    timers: { delay: async () => {}, setTimeout, clearTimeout }
  })

  assert.deepEqual(bot.controls, [['forward', true], ['forward', false]])
  assert.equal(ledger.sessions[0].stages.at(-1).name, 'ended')
})

for (const [name, botOptions, overrides, pattern] of [
  ['a kicked connection', { failureAt: 'login' }, {}, /kicked/i],
  ['a bot error', { terminal: 'error' }, {}, /socket broke/i],
  ['the wrong negotiated version', { version: '1.21.10' }, {}, /negotiated version/i],
  ['a connection timeout', {}, { timeoutAt: 1 }, /timed out/i],
  ['a kick during movement', {}, { failureDuringMovement: true }, /kicked during movement/i],
  ['a missing terminal event', { terminal: 'missing' }, { timeoutAt: 4 }, /timed out/i],
  ['a failed Paper position probe', {}, { probeError: true }, /position probe failed/i]
]) {
  test(`fails closed for ${name} and always cleans up`, async () => {
    const harness = buildHarness(botOptions, overrides)

    await assert.rejects(harness.run(), pattern)

    assert.equal(harness.bot.clearCalls, 1)
    assert.equal([...harness.bot.controls.values()].every((enabled) => enabled === false), true)
    assert.deepEqual(harness.bot.eventNames(), [])
    assert.throws(() => harness.ledger.finalize(), /failed state/i)
  })
}

test('rejects a non-loopback endpoint before constructing a bot', async () => {
  const harness = buildHarness({}, { endpoint: { host: '192.0.2.1', port: 25565 } })

  await assert.rejects(harness.run(), /loopback/i)

  assert.deepEqual(harness.factoryOptions, [])
  assert.equal(harness.bot.clearCalls, 0)
  assert.throws(() => harness.ledger.finalize(), /failed state/i)
})

test('rejects insufficient server-observed movement and disables movement', async () => {
  const harness = buildHarness()
  let calls = 0
  harness.bot.entity = { position: { x: 0, y: 64, z: 0 }, onGround: true, yaw: 0 }

  await assert.rejects(
    runClientSession({
      sessionId: 'session-001',
      username: 'elah_lab_001',
      endpoint: { host: '127.0.0.1', port: 25565 },
      version: '1.21.8',
      direction: 'forward',
      botFactory: () => {
        setImmediate(() => harness.bot.start())
        return harness.bot
      },
      positionProbe: async () => (++calls === 1
        ? { x: 0, y: 64, z: 0 }
        : { x: 0.1, y: 64, z: 0.1 }),
      ledger: harness.ledger,
      timers: {
        delay: async () => {
          harness.bot.entity.position = { x: 1, y: 64, z: 0 }
        },
        setTimeout,
        clearTimeout
      }
    }),
    /server-observed horizontal displacement 0\.141.+client-local horizontal displacement 1\.000/i
  )

  assert.deepEqual(harness.bot.controlCalls, [['forward', true], ['forward', false]])
  assert.equal(harness.bot.clearCalls, 1)
  assert.deepEqual(harness.bot.eventNames(), [])
})
