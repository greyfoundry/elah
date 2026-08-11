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
import { createHash } from 'node:crypto'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { downloadPinnedPaper } from '../download-paper.mjs'

const BODY = new TextEncoder().encode('verified-paper-fixture')
const SHA256 = createHash('sha256').update(BODY).digest('hex')

async function withDestination (run) {
  const root = await mkdtemp(join(tmpdir(), 'elah-paper-download-'))
  try {
    await run(join(root, 'paper.jar'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function compatibility (overrides = {}) {
  return {
    paperUrl: 'https://example.test/paper.jar',
    paperSha256: SHA256,
    paperMaxBytes: 1024,
    ...overrides
  }
}

function response (body = BODY, options = {}) {
  const headers = new Headers(options.headers)
  if (!options.omitLength) headers.set('content-length', String(options.declaredLength ?? body.byteLength))
  return new Response(body, { status: options.status ?? 200, headers })
}

test('publishes bytes only after bounded checksum verification', async () => {
  await withDestination(async (destination) => {
    const calls = []
    const result = await downloadPinnedPaper({
      destination,
      compatibility: compatibility(),
      fetchImpl: async (url, options) => {
        calls.push([url, options])
        return response()
      }
    })

    assert.deepEqual(await readFile(destination), Buffer.from(BODY))
    assert.deepEqual(result, { path: destination, sha256: SHA256, bytes: BODY.byteLength })
    assert.equal(calls[0][0], 'https://example.test/paper.jar')
    assert.equal(calls[0][1].redirect, 'manual')
  })
})

for (const [name, source, fetchImpl, pattern] of [
  ['non-HTTPS URLs', compatibility({ paperUrl: 'http://example.test/paper.jar' }), async () => response(), /HTTPS/i],
  ['redirect responses', compatibility(), async () => response(null, { status: 302, headers: { location: 'https://other.test/paper.jar' }, omitLength: true }), /redirect/i],
  ['non-200 responses', compatibility(), async () => response(BODY, { status: 503 }), /status 503/i],
  ['absent lengths', compatibility(), async () => response(BODY, { omitLength: true }), /content-length/i],
  ['declared oversize bodies', compatibility({ paperMaxBytes: 4 }), async () => response(BODY), /size limit/i],
  ['streamed oversize bodies', compatibility({ paperMaxBytes: 8 }), async () => response(BODY, { declaredLength: 8 }), /size limit/i],
  ['truncated bodies', compatibility(), async () => response(BODY, { declaredLength: BODY.byteLength + 1 }), /truncated/i],
  ['checksum mismatches', compatibility({ paperSha256: '0'.repeat(64) }), async () => response(), /checksum/i]
]) {
  test(`rejects ${name} without publishing a JAR`, async () => {
    await withDestination(async (destination) => {
      await assert.rejects(downloadPinnedPaper({ destination, compatibility: source, fetchImpl }), pattern)
      await assert.rejects(access(destination))
    })
  })
}

test('reuses a matching destination and preserves a mismatching existing file', async () => {
  await withDestination(async (destination) => {
    await writeFile(destination, BODY)
    const result = await downloadPinnedPaper({
      destination,
      compatibility: compatibility(),
      fetchImpl: async () => { throw new Error('network must not be used') }
    })
    assert.equal(result.sha256, SHA256)

    await writeFile(destination, 'wrong artifact')
    await assert.rejects(downloadPinnedPaper({
      destination,
      compatibility: compatibility(),
      fetchImpl: async () => response()
    }), /existing Paper artifact/i)
    assert.equal(await readFile(destination, 'utf8'), 'wrong artifact')
  })
})
