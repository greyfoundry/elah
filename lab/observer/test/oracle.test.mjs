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
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createFixture } from '../create-fixture.mjs'
import { inventoryFiles } from '../fixture-hash.mjs'
import { runLaboratory } from '../run-laboratory.mjs'
import { verifyReports } from '../verify-report.mjs'

async function temporaryDirectory (prefix) {
  return mkdtemp(join(tmpdir(), prefix))
}

test('Prismarine fixture truth and complete hashes are deterministic', async () => {
  const first = await temporaryDirectory('elah-observer-first-')
  const second = await temporaryDirectory('elah-observer-second-')
  try {
    const firstTruth = await createFixture(first, { small: true })
    const secondTruth = await createFixture(second, { small: true })
    assert.deepEqual(firstTruth, secondTruth)
    assert.deepEqual(await inventoryFiles(first), await inventoryFiles(second))
  } finally {
    await Promise.all([rm(first, { recursive: true, force: true }), rm(second, { recursive: true, force: true })])
  }
})

test('inventory uses normalized sorted paths and complete SHA-256 values', async () => {
  const root = await temporaryDirectory('elah-observer-inventory-')
  try {
    await createFixture(root, { small: true })
    const inventory = await inventoryFiles(root)
    const paths = inventory.map(entry => entry.path)
    assert.deepEqual(paths, [...paths].sort())
    assert.ok(paths.includes('level.dat'))
    assert.ok(paths.some(path => path.endsWith('.mca')))
    for (const entry of inventory) {
      assert.match(entry.sha256, /^[0-9a-f]{64}$/)
      assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('report verification rejects mismatches instead of weakening fixture truth', () => {
  const truth = {
    levelName: 'Observer Laboratory',
    dataVersion: 4189,
    chunks: [{ dimension: 'minecraft:overworld', x: 0, z: 0, status: 'full', dataVersion: 4189 }]
  }
  const standard = reportFixture('standard')
  const deep = reportFixture('deep')
  assert.throws(() => verifyReports(truth, standard, deep), /occupied chunks/i)
})

test('failed laboratory runs leave no report or comparison artifact', async () => {
  const output = await temporaryDirectory('elah-observer-output-')
  try {
    await assert.rejects(
      runLaboratory({
        elahPath: join(output, 'missing-elah'),
        outputDirectory: output,
        small: true
      }),
      /missing-elah|ENOENT/
    )
    await assert.rejects(readFile(join(output, 'report.json')))
    await assert.rejects(readFile(join(output, 'comparison.json')))
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})

function reportFixture (depth) {
  return {
    schema: 'elah.observe/v1',
    world: { level_name: 'Observer Laboratory', data_version: 4189 },
    scan: { depth, consistent: true, content_nbt_decoded: depth === 'deep' },
    totals: { occupied_chunks: 0, region_files: 1, logical_bytes: 8192, region_bytes: 8192 },
    dimensions: [{ id: 'minecraft:overworld', occupied_chunks: 0, region_files: 1 }],
    deep_validation: depth === 'deep' ? { decoded_chunks: 0, data_versions: [], statuses: [] } : null
  }
}
