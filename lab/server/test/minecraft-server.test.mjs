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
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import test from 'node:test'

import { MinecraftServerLaboratory } from '../minecraft-server.mjs'

class FakeChild extends EventEmitter {
  constructor () {
    super()
    this.stdout = new PassThrough()
    this.stderr = new PassThrough()
    this.commands = []
    this.stdin = new Writable({
      write: (chunk, encoding, callback) => {
        const command = chunk.toString().trim()
        this.commands.push(command)
        if (command === 'stop') {
          setImmediate(() => this.emit('exit', 0, null))
        } else {
          const username = command.match(/name=(elah_lab_[0-9]{3}),/)?.[1] ?? command.split(' ')[3]
          setImmediate(() => this.stdout.write(
            `[Global region/INFO]: ${username} has the following entity data: [8.5d, 64.0d, -2.25d]\n`
          ))
        }
        callback()
      }
    })
    setImmediate(() => this.stdout.write('[Global region/INFO]: Done (1.000s)! For help, type "help"\n'))
  }
}

test('runs a named server through the bounded loopback lifecycle', async () => {
  const root = await mkdtemp(join(tmpdir(), 'elah-minecraft-server-'))
  const child = new FakeChild()
  const calls = []
  const server = new MinecraftServerLaboratory({
    java: 'java',
    root,
    jar: join(root, 'folia.jar'),
    port: 25570,
    serverName: 'Folia',
    motd: 'Elah Folia Baseline Laboratory',
    limits: {
      startupTimeoutMillis: 1000,
      commandTimeoutMillis: 1000,
      stopTimeoutMillis: 1000,
      maximumDiagnosticLines: 10,
      initialMemoryMiB: 512,
      maximumMemoryMiB: 1536
    },
    spawnImpl: (file, args, options) => {
      calls.push({ file, args, options })
      return child
    }
  })
  try {
    await server.start()
    const properties = await readFile(join(root, 'server.properties'), 'utf8')
    assert.match(properties, /^server-ip=127\.0\.0\.1$/m)
    assert.match(properties, /^motd=Elah Folia Baseline Laboratory$/m)
    assert.equal(calls[0].options.shell, false)
    assert.deepEqual(calls[0].args, ['-Xms512M', '-Xmx1536M', '-jar', join(root, 'folia.jar'), '--nogui'])
    assert.deepEqual(await server.queryPosition('elah_lab_001'), { x: 8.5, y: 64, z: -2.25 })
    assert.deepEqual(await server.stop(), { requested: true, exitCode: 0, signal: null })
    assert.deepEqual(child.commands, ['data get entity elah_lab_001 Pos', 'stop'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects incomplete generic server limits before process creation', () => {
  assert.throws(() => new MinecraftServerLaboratory({
    java: 'java',
    root: 'root',
    jar: 'server.jar',
    port: 25570,
    serverName: 'Folia',
    motd: 'test',
    limits: {}
  }), /startupTimeoutMillis/i)
})
