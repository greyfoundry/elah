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

import { PaperLaboratory } from '../paper.mjs'

class FakeChild extends EventEmitter {
  constructor ({
    autoReady = true,
    exitCode = 0,
    position = [12.5, 64, -3.25],
    noQueryReply = false,
    noStopExit = false
  } = {}) {
    super()
    this.stdout = new PassThrough()
    this.stderr = new PassThrough()
    this.commands = []
    this.exitCode = exitCode
    this.position = position
    this.noQueryReply = noQueryReply
    this.stdin = new Writable({
      write: (chunk, encoding, callback) => {
        const command = chunk.toString().trim()
        this.commands.push(command)
        if (command === 'stop' && !noStopExit) {
          setImmediate(() => this.emit('exit', this.exitCode, null))
        } else if (!this.noQueryReply) {
          const username = command.split(' ')[3]
          setImmediate(() => this.line(
            `[Server thread/INFO]: ${username} has the following entity data: [${this.position[0]}d, ${this.position[1]}d, ${this.position[2]}d]`
          ))
        }
        callback()
      }
    })
    if (autoReady) {
      setImmediate(() => {
        this.line('[Server thread/INFO]: Preparing spawn area: 100%')
        this.line('[Server thread/INFO]: Done (1.234s)! For help, type "help"')
      })
    }
  }

  line (value) {
    this.stdout.write(`${value}\n`)
  }
}

async function withHarness (options, run) {
  const root = await mkdtemp(join(tmpdir(), 'elah-paper-lab-'))
  const calls = []
  const child = new FakeChild(options.child)
  let timeoutCall = 0
  const timers = options.timeoutAt
    ? {
        setTimeout: (callback, milliseconds) => {
          timeoutCall += 1
          if (timeoutCall !== options.timeoutAt) return setTimeout(callback, milliseconds)
          queueMicrotask(callback)
          return Symbol('timer')
        },
        clearTimeout: (timer) => {
          if (typeof timer !== 'symbol') clearTimeout(timer)
        }
      }
    : { setTimeout, clearTimeout }
  const harness = new PaperLaboratory({
    java: 'C:\\Java\\bin\\java.exe',
    root,
    jar: join(root, 'paper.jar'),
    port: 25570,
    spawnImpl: (file, args, spawnOptions) => {
      calls.push({ file, args, options: spawnOptions })
      return child
    },
    timers
  })
  try {
    await run({ harness, child, calls, root })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('writes a loopback-only disposable server and requires the Paper Done line', async () => {
  await withHarness({}, async ({ harness, child, calls, root }) => {
    await harness.start()

    assert.equal(await readFile(join(root, 'eula.txt'), 'utf8'), 'eula=true\n')
    const properties = await readFile(join(root, 'server.properties'), 'utf8')
    assert.match(properties, /^server-ip=127\.0\.0\.1$/m)
    assert.match(properties, /^server-port=25570$/m)
    assert.match(properties, /^online-mode=false$/m)
    assert.match(properties, /^level-type=minecraft:flat$/m)
    assert.match(
      properties,
      /^generator-settings=\{"layers":\[\{"block":"minecraft:bedrock","height":1\},\{"block":"minecraft:dirt","height":2\},\{"block":"minecraft:grass_block","height":1\}\],"biome":"minecraft:plains"\}$/m
    )
    assert.match(properties, /^generate-structures=false$/m)
    assert.deepEqual(calls, [{
      file: 'C:\\Java\\bin\\java.exe',
      args: ['-Xms512M', '-Xmx1536M', '-jar', join(root, 'paper.jar'), '--nogui'],
      options: {
        cwd: root,
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      }
    }])

    await harness.stop()
    assert.deepEqual(child.commands, ['stop'])
  })
})

test('queries an exact username and parses finite authoritative coordinates', async () => {
  await withHarness({}, async ({ harness, child }) => {
    await harness.start()
    assert.deepEqual(await harness.queryPosition('elah_lab_001'), { x: 12.5, y: 64, z: -3.25 })
    assert.deepEqual(child.commands, ['data get entity elah_lab_001 Pos'])
    await harness.stop()
  })
})

test('rejects unsafe usernames before writing to Paper stdin', async () => {
  await withHarness({}, async ({ harness, child }) => {
    await harness.start()
    await assert.rejects(harness.queryPosition('elah_lab_001 stop'), /username/i)
    assert.deepEqual(child.commands, [])
    await harness.stop()
  })
})

test('does not accept arbitrary startup output as readiness', async () => {
  await withHarness({ child: { autoReady: false }, timeoutAt: 1 }, async ({ harness, child }) => {
    child.line('[Server thread/INFO]: Server started')
    await assert.rejects(harness.start(), /timed out/i)
    await harness.stop()
  })
})

test('bounds diagnostics to the fixed most-recent line limit', async () => {
  await withHarness({}, async ({ harness, child }) => {
    await harness.start()
    for (let index = 0; index < 520; index += 1) child.line(`diagnostic ${index}`)
    const diagnostics = harness.diagnostics()
    assert.equal(diagnostics.length, 500)
    assert.match(diagnostics[0], /diagnostic 20$/)
    assert.match(diagnostics.at(-1), /diagnostic 519$/)
    await harness.stop()
  })
})

test('fails query timeout and still permits finally cleanup', async () => {
  await withHarness({ child: { noQueryReply: true }, timeoutAt: 2 }, async ({ harness, child }) => {
    await harness.start()
    await assert.rejects(harness.queryPosition('elah_lab_001'), /timed out/i)
    await harness.stop()
    assert.deepEqual(child.commands, ['data get entity elah_lab_001 Pos', 'stop'])
  })
})

test('sends one stop and rejects nonzero server exit', async () => {
  await withHarness({ child: { exitCode: 7 } }, async ({ harness, child }) => {
    await harness.start()
    await assert.rejects(harness.stop(), /exit code 7/i)
    await assert.rejects(harness.stop(), /already requested/i)
    assert.deepEqual(child.commands, ['stop'])
  })
})

test('fails a bounded stop timeout without sending stop twice', async () => {
  await withHarness({ child: { noStopExit: true }, timeoutAt: 2 }, async ({ harness, child }) => {
    await harness.start()
    await assert.rejects(harness.stop(), /timed out/i)
    await assert.rejects(harness.stop(), /already requested/i)
    assert.deepEqual(child.commands, ['stop'])
  })
})

test('rejects malformed or non-finite position evidence', async () => {
  await withHarness({ child: { position: ['NaN', 64, 0] } }, async ({ harness }) => {
    await harness.start()
    await assert.rejects(harness.queryPosition('elah_lab_001'), /invalid position/i)
    await harness.stop()
  })
})
