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

import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'

import { ClientLaboratoryError, CLIENT_LAB_COMPATIBILITY } from './compatibility.mjs'

const USERNAME_PATTERN = /^elah_lab_[0-9]{3}$/
const NUMBER_PATTERN = '[-+]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][-+]?[0-9]+)?'

export class PaperLaboratory {
  #java
  #root
  #jar
  #port
  #spawn
  #timers
  #child
  #exitPromise
  #readyPromise
  #resolveReady
  #pendingPositions = new Map()
  #diagnosticLines = []
  #started = false
  #stopRequested = false

  constructor ({ java, root, jar, port, spawnImpl = spawn, timers = { setTimeout, clearTimeout } }) {
    if (typeof java !== 'string' || java.trim() === '') {
      throw new ClientLaboratoryError('invalid_java', 'Java executable path must be nonblank')
    }
    if (typeof root !== 'string' || root.trim() === '' || typeof jar !== 'string' || jar.trim() === '') {
      throw new ClientLaboratoryError('invalid_paper_paths', 'Paper root and verified JAR paths are required')
    }
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
      throw new ClientLaboratoryError('invalid_endpoint', 'Paper port must be between 1 and 65535')
    }
    if (
      typeof spawnImpl !== 'function' ||
      typeof timers?.setTimeout !== 'function' ||
      typeof timers?.clearTimeout !== 'function'
    ) {
      throw new ClientLaboratoryError('invalid_adapter', 'Paper process adapters are incomplete')
    }
    this.#java = java
    this.#root = root
    this.#jar = jar
    this.#port = port
    this.#spawn = spawnImpl
    this.#timers = timers
  }

  async start () {
    if (this.#child) {
      throw new ClientLaboratoryError('paper_already_started', 'Paper start was already requested')
    }
    await this.#writeConfiguration()
    this.#createReadyPromise()
    this.#child = this.#spawn(
      this.#java,
      ['-Xms512M', '-Xmx1536M', '-jar', this.#jar, '--nogui'],
      {
        cwd: this.#root,
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      }
    )
    this.#validateChild()
    this.#installLineReader(this.#child.stdout)
    this.#installLineReader(this.#child.stderr)
    this.#exitPromise = new Promise((resolve, reject) => {
      this.#child.once('error', reject)
      this.#child.once('exit', (exitCode, signal) => resolve({ exitCode, signal }))
    })

    await this.#withTimeout(
      Promise.race([
        this.#readyPromise,
        this.#exitPromise.then(({ exitCode, signal }) => {
          throw new ClientLaboratoryError(
            'paper_exited_early',
            `Paper exited before readiness with code ${String(exitCode)} and signal ${String(signal)}`
          )
        })
      ]),
      CLIENT_LAB_COMPATIBILITY.paperStartupTimeoutMillis,
      'Paper timed out before the Done readiness line'
    )
    this.#started = true
  }

  async queryPosition (username) {
    if (!this.#started || this.#stopRequested) {
      throw new ClientLaboratoryError('paper_not_available', 'Paper must be ready and running before position queries')
    }
    if (!USERNAME_PATTERN.test(username)) {
      throw new ClientLaboratoryError('unsafe_username', 'Paper query username must match elah_lab_NNN')
    }
    if (this.#pendingPositions.has(username)) {
      throw new ClientLaboratoryError('duplicate_position_query', `position query already pending for ${username}`)
    }

    let resolvePosition
    let rejectPosition
    const response = new Promise((resolve, reject) => {
      resolvePosition = resolve
      rejectPosition = reject
    })
    this.#pendingPositions.set(username, { resolve: resolvePosition, reject: rejectPosition })
    try {
      this.#child.stdin.write(`data get entity ${username} Pos\n`)
      return await this.#withTimeout(
        Promise.race([
          response,
          this.#exitPromise.then(({ exitCode, signal }) => {
            throw new ClientLaboratoryError(
              'paper_exited_during_query',
              `Paper exited during ${username} position query with code ${String(exitCode)} and signal ${String(signal)}`
            )
          })
        ]),
        CLIENT_LAB_COMPATIBILITY.paperCommandTimeoutMillis,
        `Paper position query timed out for ${username}`
      )
    } finally {
      this.#pendingPositions.delete(username)
    }
  }

  async stop () {
    if (!this.#child) {
      throw new ClientLaboratoryError('paper_not_started', 'Paper has not been started')
    }
    if (this.#stopRequested) {
      throw new ClientLaboratoryError('paper_stop_repeated', 'Paper stop was already requested')
    }
    this.#stopRequested = true
    this.#child.stdin.write('stop\n')
    const { exitCode, signal } = await this.#withTimeout(
      this.#exitPromise,
      CLIENT_LAB_COMPATIBILITY.paperStopTimeoutMillis,
      'Paper timed out during requested clean shutdown'
    )
    this.#started = false
    if (signal !== null && signal !== undefined) {
      throw new ClientLaboratoryError('paper_signal_exit', `Paper exited from signal ${signal}`)
    }
    if (exitCode !== 0) {
      throw new ClientLaboratoryError('paper_nonzero_exit', `Paper exited with exit code ${exitCode}`)
    }
    return { requested: true, exitCode: 0 }
  }

  diagnostics () {
    return [...this.#diagnosticLines]
  }

  async #writeConfiguration () {
    await mkdir(this.#root, { recursive: true })
    const properties = [
      'server-ip=127.0.0.1',
      `server-port=${this.#port}`,
      'online-mode=false',
      'level-name=world',
      'level-type=minecraft:flat',
      'generator-settings={"layers":[{"block":"minecraft:bedrock","height":1},{"block":"minecraft:dirt","height":2},{"block":"minecraft:grass_block","height":1}],"biome":"minecraft:plains"}',
      'generate-structures=false',
      'max-players=20',
      'view-distance=3',
      'simulation-distance=3',
      'spawn-animals=false',
      'spawn-monsters=false',
      'spawn-npcs=false',
      'enable-command-block=false',
      'motd=Elah Client Laboratory'
    ].join('\n') + '\n'
    await Promise.all([
      writeFile(join(this.#root, 'eula.txt'), 'eula=true\n', { encoding: 'utf8', flag: 'wx' }),
      writeFile(join(this.#root, 'server.properties'), properties, { encoding: 'utf8', flag: 'wx' })
    ])
  }

  #createReadyPromise () {
    this.#readyPromise = new Promise((resolve) => {
      this.#resolveReady = resolve
    })
  }

  #validateChild () {
    if (
      typeof this.#child?.once !== 'function' ||
      typeof this.#child?.stdin?.write !== 'function' ||
      typeof this.#child?.stdout?.on !== 'function' ||
      typeof this.#child?.stderr?.on !== 'function'
    ) {
      throw new ClientLaboratoryError('invalid_paper_process', 'Paper spawn returned an incomplete child process')
    }
  }

  #installLineReader (stream) {
    const decoder = new StringDecoder('utf8')
    let pending = ''
    stream.on('data', (chunk) => {
      pending += decoder.write(chunk)
      const lines = pending.split(/\r?\n/)
      pending = lines.pop()
      for (const line of lines) this.#consumeLine(line)
    })
    stream.on('end', () => {
      pending += decoder.end()
      if (pending !== '') this.#consumeLine(pending)
      pending = ''
    })
  }

  #consumeLine (line) {
    this.#diagnosticLines.push(line.slice(0, 2_000))
    if (this.#diagnosticLines.length > CLIENT_LAB_COMPATIBILITY.maximumDiagnosticLines) {
      this.#diagnosticLines.splice(
        0,
        this.#diagnosticLines.length - CLIENT_LAB_COMPATIBILITY.maximumDiagnosticLines
      )
    }
    if (/\bDone \([^)]+\)! For help, type/.test(line)) this.#resolveReady()

    for (const [username, pending] of this.#pendingPositions) {
      const marker = `${username} has the following entity data:`
      const markerIndex = line.indexOf(marker)
      if (markerIndex === -1) continue
      const values = line.slice(markerIndex + marker.length).match(new RegExp(
        `\\[(${NUMBER_PATTERN})[dDfF]?,\\s*(${NUMBER_PATTERN})[dDfF]?,\\s*(${NUMBER_PATTERN})[dDfF]?\\]`
      ))
      if (!values) {
        pending.reject(new ClientLaboratoryError(
          'invalid_position_response',
          `Paper returned an invalid position for ${username}`
        ))
        continue
      }
      const position = { x: Number(values[1]), y: Number(values[2]), z: Number(values[3]) }
      if (!Object.values(position).every(Number.isFinite)) {
        pending.reject(new ClientLaboratoryError(
          'invalid_position_response',
          `Paper returned non-finite coordinates for ${username}`
        ))
        continue
      }
      pending.resolve(position)
    }
  }

  async #withTimeout (promise, milliseconds, message) {
    let timer
    const timeout = new Promise((resolve, reject) => {
      timer = this.#timers.setTimeout(
        () => reject(new ClientLaboratoryError('paper_timeout', message)),
        milliseconds
      )
    })
    try {
      return await Promise.race([promise, timeout])
    } finally {
      if (timer !== undefined) this.#timers.clearTimeout(timer)
    }
  }
}
