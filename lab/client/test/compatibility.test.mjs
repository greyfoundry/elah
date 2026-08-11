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
import test from 'node:test'

import {
  CLIENT_LAB_COMPATIBILITY,
  ClientLaboratoryError,
  assertCompatibility,
  assertLoopbackHost,
  assertPinnedPaperSource
} from '../compatibility.mjs'

test('accepts only the qualified Mineflayer and Minecraft tuple', () => {
  assert.doesNotThrow(() => assertCompatibility({
    mineflayerVersion: '4.37.1',
    minecraftVersion: '1.21.11'
  }))

  for (const candidate of [
    { mineflayerVersion: '4.37.0', minecraftVersion: '1.21.11' },
    { mineflayerVersion: '4.37.1', minecraftVersion: '26.2' },
    { mineflayerVersion: '', minecraftVersion: '1.21.11' }
  ]) {
    assert.throws(
      () => assertCompatibility(candidate),
      (error) => error instanceof ClientLaboratoryError && error.kind === 'unsupported_compatibility'
    )
  }
})
test('allows loopback endpoints and rejects network exposure', () => {
  for (const host of ['127.0.0.1', '::1', 'localhost']) {
    assert.doesNotThrow(() => assertLoopbackHost(host))
  }
  for (const host of ['0.0.0.0', '192.0.2.10', 'paper.example.com', '']) {
    assert.throws(
      () => assertLoopbackHost(host),
      (error) => error instanceof ClientLaboratoryError && error.kind === 'unsafe_endpoint'
    )
  }
})

test('requires the exact Paper object URL, checksum, and bounded size', () => {
  const exact = {
    url: 'https://fill-data.papermc.io/v1/objects/5ffef465eeeb5f2a3c23a24419d97c51afd7dbb4923ff42df9a3f58bba1ccfba/paper-1.21.11-132.jar',
    sha256: '5ffef465eeeb5f2a3c23a24419d97c51afd7dbb4923ff42df9a3f58bba1ccfba',
    maxBytes: 64 * 1024 * 1024
  }
  assert.doesNotThrow(() => assertPinnedPaperSource(exact))

  for (const candidate of [
    { ...exact, url: 'https://example.com/paper.jar' },
    { ...exact, url: exact.url.replace('https:', 'http:') },
    { ...exact, sha256: '0'.repeat(64) },
    { ...exact, sha256: 'not-a-digest' },
    { ...exact, maxBytes: 0 },
    { ...exact, maxBytes: Number.MAX_SAFE_INTEGER + 1 }
  ]) {
    assert.throws(
      () => assertPinnedPaperSource(candidate),
      (error) => error instanceof ClientLaboratoryError && error.kind === 'unsafe_paper_source'
    )
  }
})

test('publishes fixed resource and lifecycle limits', () => {
  assert.deepEqual(
    {
      mineflayerVersion: CLIENT_LAB_COMPATIBILITY.mineflayerVersion,
      minecraftVersion: CLIENT_LAB_COMPATIBILITY.minecraftVersion,
      paperBuild: CLIENT_LAB_COMPATIBILITY.paperBuild,
      paperMaxBytes: CLIENT_LAB_COMPATIBILITY.paperMaxBytes,
      waves: CLIENT_LAB_COMPATIBILITY.waves,
      concurrency: CLIENT_LAB_COMPATIBILITY.concurrency,
      minimumHorizontalDisplacement: CLIENT_LAB_COMPATIBILITY.minimumHorizontalDisplacement
    },
    {
      mineflayerVersion: '4.37.1',
      minecraftVersion: '1.21.11',
      paperBuild: 132,
      paperMaxBytes: 64 * 1024 * 1024,
      waves: 2,
      concurrency: 16,
      minimumHorizontalDisplacement: 0.5
    }
  )
})
