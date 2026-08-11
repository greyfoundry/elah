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
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { assertWorldUnchanged, hashWorldTree } from '../world-integrity.mjs'

async function withWorld (run) {
  const root = await mkdtemp(join(tmpdir(), 'elah-folia-world-'))
  try {
    await mkdir(join(root, 'region'))
    await writeFile(join(root, 'level.dat'), Buffer.from('level'))
    await writeFile(join(root, 'region', 'r.0.0.mca'), Buffer.from([0, 1, 2, 3]))
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('hashes sorted framed world paths and bytes deterministically', async () => {
  await withWorld(async (root) => {
    const first = await hashWorldTree(root)
    const second = await hashWorldTree(root)
    assert.deepEqual(first, second)
    assert.equal(first.schema, 'elah.world-tree/v1')
    assert.equal(first.regularFileCount, 2)
    assert.equal(first.regularBytes, 9)
    assert.deepEqual(first.files.map(({ path }) => path), ['level.dat', 'region/r.0.0.mca'])
    assert.match(first.rootSha256, /^[a-f0-9]{64}$/)
    assert.doesNotThrow(() => assertWorldUnchanged(first, second))
  })
})

test('detects additions, removals, replacements, and content mutation', async () => {
  await withWorld(async (root) => {
    const baseline = await hashWorldTree(root)
    await writeFile(join(root, 'new.dat'), 'new')
    const withAddition = await hashWorldTree(root)
    assert.throws(() => assertWorldUnchanged(baseline, withAddition), /changed/i)
    await rm(join(root, 'new.dat'))
    await rm(join(root, 'level.dat'))
    const withRemoval = await hashWorldTree(root)
    assert.throws(() => assertWorldUnchanged(baseline, withRemoval), /changed/i)
    await writeFile(join(root, 'level.dat'), 'other')
    const withReplacement = await hashWorldTree(root)
    assert.throws(() => assertWorldUnchanged(baseline, withReplacement), /changed/i)
  })
})

test('fails closed when world limits are exceeded', async () => {
  await withWorld(async (root) => {
    await assert.rejects(hashWorldTree(root, { maximumFiles: 1 }), /file count limit/i)
    await assert.rejects(hashWorldTree(root, { maximumTotalBytes: 8 }), /total byte limit/i)
    await assert.rejects(hashWorldTree(root, { maximumFileBytes: 3 }), /individual file limit/i)
    await assert.rejects(hashWorldTree(root, { maximumPathBytes: 5 }), /path byte limit/i)
  })
})

test('rejects symlinks instead of following them', async (context) => {
  if (process.platform === 'win32') {
    context.skip('unprivileged Windows symlink creation is not reliable')
    return
  }
  await withWorld(async (root) => {
    await symlink(join(root, 'level.dat'), join(root, 'linked.dat'))
    await assert.rejects(hashWorldTree(root), /symlink/i)
  })
})
