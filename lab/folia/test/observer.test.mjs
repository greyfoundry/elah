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

import { runObserver } from '../observer.mjs'

function report (depth) {
  return {
    schema: 'elah.observe/v1',
    observer_version: '0.0.5',
    scan: {
      depth,
      consistent: true,
      content_nbt_decoded: depth === 'deep'
    }
  }
}

test('runs standard and deep Observer with exact bounded arguments', async () => {
  for (const deep of [false, true]) {
    const calls = []
    const result = await runObserver({
      executable: 'target/debug/elah',
      world: 'fixture/world',
      deep,
      execFileImpl: async (file, args, options) => {
        calls.push({ file, args, options })
        return { stdout: `${JSON.stringify(report(deep ? 'deep' : 'standard'))}\n`, stderr: 'bounded notice\n' }
      }
    })
    assert.equal(result.report.scan.depth, deep ? 'deep' : 'standard')
    assert.equal(result.diagnostics, 'bounded notice\n')
    assert.equal(calls[0].options.shell, false)
    assert.equal(calls[0].options.windowsHide, true)
    assert.deepEqual(calls[0].args, [
      'observe',
      calls[0].args[1],
      '--format',
      'json',
      '--verbose',
      ...(deep ? ['--deep'] : [])
    ])
  }
})

for (const [name, stdout, deep, pattern] of [
  ['malformed JSON', '{', false, /valid JSON/i],
  ['wrong schema', JSON.stringify({ ...report('standard'), schema: 'elah.error/v1' }), false, /schema/i],
  ['wrong depth', JSON.stringify(report('deep')), false, /depth/i],
  ['inconsistent evidence', JSON.stringify({ ...report('standard'), scan: { ...report('standard').scan, consistent: false } }), false, /consistent/i],
  ['false deep decode', JSON.stringify({ ...report('deep'), scan: { ...report('deep').scan, content_nbt_decoded: false } }), true, /decoded/i]
]) {
  test(`rejects ${name}`, async () => {
    await assert.rejects(runObserver({
      executable: 'elah',
      world: 'world',
      deep,
      execFileImpl: async () => ({ stdout, stderr: '' })
    }), pattern)
  })
}

test('preserves a plain failure summary and bounds technical stderr', async () => {
  const error = new Error('Observer process exited with code 5')
  error.stderr = `technical ${'x'.repeat(20_000)}`
  await assert.rejects(runObserver({
    executable: 'elah',
    world: 'world',
    deep: false,
    execFileImpl: async () => { throw error }
  }), (failure) => {
    assert.match(failure.message, /exited with code 5/i)
    assert.equal(failure.diagnostic.length <= 4000, true)
    return true
  })
})
