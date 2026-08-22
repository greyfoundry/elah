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
import { access, lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { downloadPinnedServer } from '../download-pinned-server.mjs'

const body = Buffer.from('verified-server-fixture')
const sha256 = createHash('sha256').update(body).digest('hex')

async function withDestination (run) {
  const root = await mkdtemp(join(tmpdir(), 'elah-server-download-'))
  try {
    await run({ root, destination: join(root, 'server.jar') })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function source (overrides = {}) {
  return {
    url: 'https://example.test/server.jar',
    sha256,
    maxBytes: 1024,
    expectedBytes: body.byteLength,
    artifactName: 'server.jar',
    ...overrides
  }
}

function response (contents = body, options = {}) {
  const headers = new Headers(options.headers)
  if (!options.omitLength) {
    headers.set('content-length', String(options.declaredLength ?? contents.byteLength))
  }
  return new Response(contents, { status: options.status ?? 200, headers })
}

test('publishes the exact pinned server only after complete verification', async () => {
  await withDestination(async ({ destination }) => {
    const result = await downloadPinnedServer({
      destination,
      source: source(),
      fetchImpl: async (url, options) => {
        assert.equal(url, 'https://example.test/server.jar')
        assert.deepEqual(options, { redirect: 'manual' })
        return response()
      }
    })
    assert.deepEqual(result, { path: destination, sha256, bytes: body.byteLength })
    assert.deepEqual(await readFile(destination), body)
    assert.equal((await lstat(destination)).isFile(), true)
  })
})

for (const [name, changedSource, fetchImpl, pattern] of [
  ['non-HTTPS source', source({ url: 'http://example.test/server.jar' }), async () => response(), /HTTPS/i],
  ['redirect', source(), async () => response(null, { status: 302, omitLength: true }), /redirect/i],
  ['non-200 status', source(), async () => response(body, { status: 503 }), /status 503/i],
  ['missing length', source(), async () => response(body, { omitLength: true }), /content-length/i],
  ['wrong published length', source({ expectedBytes: body.byteLength + 1 }), async () => response(), /published byte size/i],
  ['oversize stream', source({ expectedBytes: undefined, maxBytes: 4 }), async () => response(), /size limit/i],
  ['truncated stream', source({ expectedBytes: undefined }), async () => response(body, { declaredLength: body.byteLength + 1 }), /truncated/i],
  ['wrong checksum', source({ sha256: '0'.repeat(64) }), async () => response(), /checksum/i]
]) {
  test(`rejects ${name} without publishing the artifact`, async () => {
    await withDestination(async ({ destination }) => {
      await assert.rejects(
        downloadPinnedServer({ destination, source: changedSource, fetchImpl }),
        pattern
      )
      await assert.rejects(access(destination))
    })
  })
}

test('reuses only an exact regular cached file and rejects a symlink', async (context) => {
  if (process.platform === 'win32') {
    context.skip('unprivileged Windows symlink creation is not reliable')
    return
  }
  await withDestination(async ({ root, destination }) => {
    await writeFile(destination, body)
    assert.equal((await downloadPinnedServer({
      destination,
      source: source(),
      fetchImpl: async () => { throw new Error('network must not be used') }
    })).sha256, sha256)

    await rm(destination)
    const target = join(root, 'target.jar')
    await writeFile(target, body)
    await symlink(target, destination)
    await assert.rejects(
      downloadPinnedServer({ destination, source: source(), fetchImpl: async () => response() }),
      /regular non-symlink/i
    )
  })
})
