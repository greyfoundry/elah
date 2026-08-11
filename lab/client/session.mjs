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

import { ClientLaboratoryError, CLIENT_LAB_COMPATIBILITY, assertLoopbackHost } from './compatibility.mjs'

const SUPPORTED_DIRECTIONS = new Set(['forward', 'back', 'left', 'right'])
const PROTOCOL_DIRECTION = Object.freeze({
  forward: 'forward',
  back: 'backward',
  left: 'left',
  right: 'right'
})

const DEFAULT_TIMERS = Object.freeze({
  delay: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  setTimeout,
  clearTimeout
})

export async function runClientSession ({
  sessionId,
  username,
  endpoint,
  version,
  direction,
  botFactory,
  positionProbe,
  ledger,
  timers = DEFAULT_TIMERS
}) {
  let bot
  let activeDirection
  let removeTickSynchronizer = () => {}
  const activeWaiters = new Set()

  try {
    validateInputs({ endpoint, version, direction, botFactory, positionProbe, ledger, timers })

    bot = botFactory({
      host: endpoint.host,
      port: endpoint.port,
      username,
      auth: 'offline',
      version,
      hideErrors: true,
      checkTimeoutInterval: 30_000
    })
    validateBotEvents(bot)
    if (!hasSessionControls(bot)) {
      await waitFor('inject_allowed', CLIENT_LAB_COMPATIBILITY.connectTimeoutMillis)
    }
    validateSessionControls(bot)
    removeTickSynchronizer = synchronizeClientTicks(bot)

    await waitFor('connect', CLIENT_LAB_COMPATIBILITY.connectTimeoutMillis)
    ledger.record(sessionId, 'connected')

    await waitFor('login', CLIENT_LAB_COMPATIBILITY.connectTimeoutMillis)
    if (bot.version !== version) {
      throw new ClientLaboratoryError(
        'wrong_negotiated_version',
        `Mineflayer negotiated version ${String(bot.version)} instead of ${version}`
      )
    }
    ledger.record(sessionId, 'logged_in')

    await waitFor('spawn', CLIENT_LAB_COMPATIBILITY.spawnTimeoutMillis)
    ledger.record(sessionId, 'spawned')
    bot._client.write('player_loaded', {})

    await waitFor('physicsTick', CLIENT_LAB_COMPATIBILITY.spawnTimeoutMillis)

    const clientBefore = diagnosticClientPosition(bot)
    const before = await guardBotOperation(bot, () => positionProbe(username, bot))
    ledger.record(sessionId, 'server_position_before', { position: before })

    activeDirection = direction
    setMovementState(bot, direction, true)
    ledger.record(sessionId, 'movement_requested', { direction })
    await guardBotOperation(bot, () => timers.delay(CLIENT_LAB_COMPATIBILITY.movementMillis))
    setMovementState(bot, direction, false)
    activeDirection = undefined

    const clientAfter = diagnosticClientPosition(bot)
    const after = await guardBotOperation(bot, () => positionProbe(username, bot))
    try {
      ledger.record(sessionId, 'server_position_after', { position: after })
    } catch (error) {
      if (error instanceof ClientLaboratoryError && error.kind === 'insufficient_movement') {
        throw new ClientLaboratoryError(error.kind, `${error.message}; ${clientMovementDiagnostic(clientBefore, clientAfter, bot)}`)
      }
      throw error
    }
    ledger.record(sessionId, 'disconnect_requested')

    const terminalWaiter = createBotEventWaiter(
      bot,
      'end',
      CLIENT_LAB_COMPATIBILITY.endTimeoutMillis,
      timers
    )
    activeWaiters.add(terminalWaiter)
    try {
      bot.quit('client laboratory complete')
    } catch (error) {
      terminalWaiter.cancel()
      throw error
    }
    await terminalWaiter.promise
    activeWaiters.delete(terminalWaiter)
    ledger.record(sessionId, 'ended')
  } catch (error) {
    if (typeof ledger?.fail === 'function') ledger.fail(error)
    throw error
  } finally {
    for (const waiter of activeWaiters) waiter.cancel()
    removeTickSynchronizer()
    if (bot) {
      if (activeDirection !== undefined) {
        try {
          setMovementState(bot, activeDirection, false)
        } catch {
          // The original session failure remains authoritative.
        }
      }
      if (typeof bot.clearControlStates === 'function') bot.clearControlStates()
    }
  }

  async function waitFor (eventName, timeoutMillis) {
    const waiter = createBotEventWaiter(bot, eventName, timeoutMillis, timers)
    activeWaiters.add(waiter)
    try {
      await waiter.promise
    } finally {
      waiter.cancel()
      activeWaiters.delete(waiter)
    }
  }
}

function validateInputs ({ endpoint, version, direction, botFactory, positionProbe, ledger, timers }) {
  if (endpoint === null || typeof endpoint !== 'object') {
    throw new ClientLaboratoryError('invalid_endpoint', 'endpoint must identify a loopback host and port')
  }
  assertLoopbackHost(endpoint.host)
  if (!Number.isSafeInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65_535) {
    throw new ClientLaboratoryError('invalid_endpoint', 'endpoint port must be between 1 and 65535')
  }
  if (version !== CLIENT_LAB_COMPATIBILITY.minecraftVersion) {
    throw new ClientLaboratoryError(
      'unsupported_compatibility',
      `Client Laboratory requires Minecraft ${CLIENT_LAB_COMPATIBILITY.minecraftVersion}`
    )
  }
  if (!SUPPORTED_DIRECTIONS.has(direction)) {
    throw new ClientLaboratoryError('invalid_direction', 'movement direction is not supported')
  }
  if (typeof botFactory !== 'function' || typeof positionProbe !== 'function') {
    throw new ClientLaboratoryError('invalid_adapter', 'bot factory and Paper position probe must be functions')
  }
  if (ledger === null || typeof ledger?.record !== 'function' || typeof ledger?.fail !== 'function') {
    throw new ClientLaboratoryError('invalid_ledger', 'session requires a client laboratory ledger')
  }
  if (
    typeof timers?.delay !== 'function' ||
    typeof timers?.setTimeout !== 'function' ||
    typeof timers?.clearTimeout !== 'function'
  ) {
    throw new ClientLaboratoryError('invalid_timers', 'session timers are incomplete')
  }
}

function validateBotEvents (bot) {
  if (
    bot === null ||
    typeof bot?.on !== 'function' ||
    typeof bot?.removeListener !== 'function'
  ) {
    throw new ClientLaboratoryError('invalid_bot_events', 'bot factory returned no Mineflayer event surface')
  }
}

function hasSessionControls (bot) {
  return (
    typeof bot?.setControlState === 'function' &&
    typeof bot?.clearControlStates === 'function' &&
    typeof bot?.quit === 'function' &&
    typeof bot?._client?.write === 'function'
  )
}

function setMovementState (bot, direction, enabled) {
  bot.setControlState(direction, enabled)
  const inputs = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    shift: false,
    sprint: false
  }
  inputs[PROTOCOL_DIRECTION[direction]] = enabled
  bot._client.write('player_input', { inputs })
}

function synchronizeClientTicks (bot) {
  const finishMovementTick = () => {
    try {
      bot._client.write('tick_end', {})
    } catch (error) {
      bot.emit('error', error)
    }
  }
  bot.on('move', finishMovementTick)
  return () => bot.removeListener('move', finishMovementTick)
}

function diagnosticClientPosition (bot) {
  const position = bot?.entity?.position
  if (
    position === null ||
    typeof position !== 'object' ||
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(position.z)
  ) return undefined
  return { x: position.x, y: position.y, z: position.z }
}

function clientMovementDiagnostic (before, after, bot) {
  if (before === undefined || after === undefined) {
    return 'client-local position was unavailable or non-finite'
  }
  const displacement = Math.hypot(after.x - before.x, after.z - before.z)
  const onGround = typeof bot?.entity?.onGround === 'boolean' ? bot.entity.onGround : 'unavailable'
  const yaw = Number.isFinite(bot?.entity?.yaw) ? bot.entity.yaw.toFixed(3) : 'unavailable'
  return `client-local horizontal displacement ${displacement.toFixed(3)} from (${formatPosition(before)}) to (${formatPosition(after)}), onGround=${onGround}, yaw=${yaw}`
}

function formatPosition ({ x, y, z }) {
  return `${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)}`
}

function validateSessionControls (bot) {
  if (!hasSessionControls(bot)) {
    throw new ClientLaboratoryError(
      'invalid_bot_controls',
      'Mineflayer plugin injection completed without movement and disconnect controls'
    )
  }
}

function createBotEventWaiter (bot, expectedEvent, timeoutMillis, timers) {
  let settled = false
  let timer
  let resolvePromise
  let rejectPromise

  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })

  const listeners = new Map()
  const settle = (error) => {
    if (settled) return
    settled = true
    cleanup()
    if (error) rejectPromise(error)
    else resolvePromise()
  }
  const cleanup = () => {
    if (timer !== undefined) timers.clearTimeout(timer)
    for (const [eventName, listener] of listeners) bot.removeListener(eventName, listener)
    listeners.clear()
  }
  const listen = (eventName, listener) => {
    listeners.set(eventName, listener)
    bot.on(eventName, listener)
  }

  listen(expectedEvent, () => settle())
  listen('kicked', (reason) => settle(new ClientLaboratoryError(
    'client_kicked',
    `Mineflayer was kicked: ${boundedReason(reason)}`
  )))
  listen('error', (error) => settle(error instanceof Error
    ? error
    : new ClientLaboratoryError('client_error', `Mineflayer error: ${boundedReason(error)}`)))
  if (expectedEvent !== 'end') {
    listen('end', (reason) => settle(new ClientLaboratoryError(
      'client_ended_early',
      `Mineflayer ended before ${expectedEvent}: ${boundedReason(reason)}`
    )))
  }

  timer = timers.setTimeout(() => settle(new ClientLaboratoryError(
    'client_timeout',
    `Mineflayer timed out waiting for ${expectedEvent}`
  )), timeoutMillis)

  return {
    promise,
    cancel: () => {
      if (settled) return
      settled = true
      cleanup()
    }
  }
}

async function guardBotOperation (bot, operation) {
  const monitor = createBotFailureMonitor(bot)
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      monitor.promise
    ])
  } finally {
    monitor.cancel()
  }
}

function createBotFailureMonitor (bot) {
  let settled = false
  let rejectPromise
  const promise = new Promise((_, reject) => {
    rejectPromise = reject
  })
  const listeners = new Map()
  const cleanup = () => {
    for (const [eventName, listener] of listeners) bot.removeListener(eventName, listener)
    listeners.clear()
  }
  const rejectOnce = (error) => {
    if (settled) return
    settled = true
    cleanup()
    rejectPromise(error)
  }
  const listen = (eventName, listener) => {
    listeners.set(eventName, listener)
    bot.on(eventName, listener)
  }

  listen('kicked', (reason) => rejectOnce(new ClientLaboratoryError(
    'client_kicked',
    `Mineflayer was kicked: ${boundedReason(reason)}`
  )))
  listen('error', (error) => rejectOnce(error instanceof Error
    ? error
    : new ClientLaboratoryError('client_error', `Mineflayer error: ${boundedReason(error)}`)))
  listen('end', (reason) => rejectOnce(new ClientLaboratoryError(
    'client_ended_early',
    `Mineflayer ended during an active operation: ${boundedReason(reason)}`
  )))

  return {
    promise,
    cancel: () => {
      if (settled) return
      settled = true
      cleanup()
    }
  }
}

function boundedReason (reason) {
  if (reason instanceof Error) return reason.message.slice(0, 300)
  if (typeof reason === 'string') return reason.slice(0, 300)
  try {
    return JSON.stringify(reason).slice(0, 300)
  } catch {
    return 'unavailable reason'
  }
}
