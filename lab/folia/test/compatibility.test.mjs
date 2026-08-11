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

import {
  FOLIA_BASELINE_COMPATIBILITY,
  assertPinnedFoliaSource
} from '../compatibility.mjs'
import { downloadPinnedFolia } from '../download-folia.mjs'
import { FoliaLaboratory } from '../folia.mjs'

const sha256 = '233843cfd5001b6f658fcab549178d694cc37f0277d004ea295de0a94c57278f'
const url = `https://fill-data.papermc.io/v1/objects/${sha256}/folia-1.21.8-6.jar`

class SelectorFoliaChild extends EventEmitter {
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
        }
        callback()
      }
    })
    setImmediate(() => this.stdout.write('[Global region/INFO]: Done (1.000s)! For help, type "help"\n'))
  }
}

class PlayerCommandBot extends EventEmitter {
  constructor () {
    super()
    this.username = 'elah_lab_001'
    this.commands = []
  }

  chat (command) {
    this.commands.push(command)
    setImmediate(() => this.emit(
      'messagestr',
      'elah_lab_001 has the following entity data: [1.0d, 64.0d, 2.0d]'
    ))
  }
}

test('publishes the exact official Folia baseline identity and limits', () => {
  assert.deepEqual(FOLIA_BASELINE_COMPATIBILITY, {
    serverKind: 'folia',
    minecraftVersion: '1.21.8',
    mineflayerVersion: '4.37.1',
    foliaBuild: 6,
    foliaCommit: '612d9bd8569fe1a6008a05325af3fad66ef1cef7',
    artifactFile: 'folia-1.21.8-6.jar',
    artifactUrl: url,
    artifactSha256: sha256,
    artifactBytes: 53064151,
    artifactMaxBytes: 67108864,
    waves: 2,
    concurrency: 16,
    minimumHorizontalDisplacement: 0.5,
    connectTimeoutMillis: 30000,
    spawnTimeoutMillis: 60000,
    movementMillis: 2000,
    endTimeoutMillis: 15000,
    serverStartupTimeoutMillis: 180000,
    serverCommandTimeoutMillis: 15000,
    serverStopTimeoutMillis: 60000,
    maximumDiagnosticLines: 500,
    initialMemoryMiB: 512,
    maximumMemoryMiB: 1536
  })
})

test('accepts only the complete pinned Folia source tuple', () => {
  assert.doesNotThrow(() => assertPinnedFoliaSource(FOLIA_BASELINE_COMPATIBILITY))
  for (const [field, value] of [
    ['serverKind', 'paper'],
    ['minecraftVersion', '1.21.11'],
    ['mineflayerVersion', '4.37.0'],
    ['foliaBuild', 5],
    ['foliaCommit', '0'.repeat(40)],
    ['artifactFile', 'folia.jar'],
    ['artifactUrl', 'https://example.test/folia.jar'],
    ['artifactSha256', '0'.repeat(64)],
    ['artifactBytes', 53064150],
    ['artifactMaxBytes', 53064151],
    ['waves', 1],
    ['concurrency', 1]
  ]) {
    assert.throws(
      () => assertPinnedFoliaSource({ ...FOLIA_BASELINE_COMPATIBILITY, [field]: value }),
      /pinned Folia 1\.21\.8 build 6/i,
      field
    )
  }
})

test('passes only the exact source into the shared downloader', async () => {
  const calls = []
  const result = await downloadPinnedFolia({
    destination: 'cache/folia.jar',
    compatibility: FOLIA_BASELINE_COMPATIBILITY,
    fetchImpl: async () => { throw new Error('shared downloader double should own fetch') },
    downloadServerImpl: async (options) => {
      calls.push(options)
      return { path: options.destination, sha256, bytes: 53064151 }
    }
  })
  assert.deepEqual(result, { path: 'cache/folia.jar', sha256, bytes: 53064151 })
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].source, {
    url,
    sha256,
    expectedBytes: 53064151,
    maxBytes: 67108864,
    artifactName: 'folia-1.21.8-6.jar',
    label: 'Folia'
  })
})

test('rejects changed compatibility before invoking the shared downloader', async () => {
  let called = false
  await assert.rejects(downloadPinnedFolia({
    destination: 'cache/folia.jar',
    compatibility: { ...FOLIA_BASELINE_COMPATIBILITY, foliaBuild: 5 },
    downloadServerImpl: async () => { called = true }
  }), /pinned Folia 1\.21\.8 build 6/i)
  assert.equal(called, false)
})

test('the Folia process wrapper also rejects a changed compatibility tuple', () => {
  assert.throws(() => new FoliaLaboratory({
    java: 'java',
    root: 'root',
    jar: 'folia.jar',
    port: 25570,
    compatibility: { ...FOLIA_BASELINE_COMPATIBILITY, foliaBuild: 5 }
  }), /pinned Folia 1\.21\.8 build 6/i)
})

test('the Folia wrapper provisions bounded operators and probes from the owning player context', async () => {
  const root = await mkdtemp(join(tmpdir(), 'elah-folia-selector-'))
  const child = new SelectorFoliaChild()
  const server = new FoliaLaboratory({
    java: 'java',
    root,
    jar: join(root, 'folia.jar'),
    port: 25570,
    spawnImpl: () => child,
    compatibility: FOLIA_BASELINE_COMPATIBILITY
  })
  try {
    await server.start()
    const bot = new PlayerCommandBot()
    assert.deepEqual(await server.queryPosition('elah_lab_001', bot), { x: 1, y: 64, z: 2 })
    await server.stop()
    assert.deepEqual(bot.commands, ['/data get entity @s Pos'])
    assert.deepEqual(child.commands, ['stop'])
    const operators = JSON.parse(await readFile(join(root, 'ops.json'), 'utf8'))
    assert.equal(operators.length, 32)
    assert.deepEqual(operators[0], {
      uuid: 'cc9f1f55-bec7-352b-a466-33147b91eb29',
      name: 'elah_lab_001',
      level: 4,
      bypassesPlayerLimit: false
    })
    assert.equal(operators[31].name, 'elah_lab_032')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
