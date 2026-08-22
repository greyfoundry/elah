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
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

import { checkTextPolicy } from './check-text-policy.mjs'

const execFileAsync = promisify(execFile)
const forbidden = String.fromCodePoint(0x2014)

async function withRepository (files, run) {
  const root = await mkdtemp(join(tmpdir(), 'elah-text-policy-'))
  try {
    await execFileAsync('git', ['init', '--quiet'], { cwd: root })
    for (const [relativePath, contents] of Object.entries(files)) {
      const destination = join(root, relativePath)
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, contents)
    }
    await execFileAsync('git', ['add', '--force', '--all'], { cwd: root })
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('accepts tracked ASCII text and binary bytes', async () => {
  await withRepository({
    'README.md': '# ASCII-only title\n',
    'src/banner.mjs': 'const banner = "ELAH | A GREYFOUNDRY PROJECT"\n',
    'assets/blob.bin': Buffer.from([0x00, 0xff, 0x7f])
  }, async (root) => {
    assert.deepEqual(await checkTextPolicy(root), [])
  })
})

test('rejects forbidden punctuation in every tracked path class', async () => {
  await withRepository({
    'src/code.mjs': `const value = "left ${forbidden} right"\n`,
    'docs/guide.md': `# Guide ${forbidden} unsafe\n`,
    'generated/output.js': `// generated ${forbidden} unsafe\n`,
    'NOTICE': `notice ${forbidden} unsafe\n`,
    'assets/image.png': Buffer.from(`bytes ${forbidden} unsafe`, 'utf8'),
    'nested/path with spaces/file.txt': `nested ${forbidden} unsafe\n`
  }, async (root) => {
    const diagnostics = await checkTextPolicy(root)
    assert.equal(diagnostics.length, 6, JSON.stringify(diagnostics))
    for (const path of [
      'assets/image.png',
      'docs/guide.md',
      'generated/output.js',
      'nested/path with spaces/file.txt',
      'NOTICE',
      'src/code.mjs'
    ]) {
      assert.equal(diagnostics.some((diagnostic) => diagnostic.startsWith(`${path}:`)), true)
    }
  })
})

test('reports every occurrence in one tracked file', async () => {
  await withRepository({
    'many.txt': `${forbidden}${forbidden}\nASCII\n${forbidden}\n`
  }, async (root) => {
    assert.deepEqual(await checkTextPolicy(root), [
      'many.txt: contains 3 forbidden U+2014 byte sequences'
    ])
  })
})

test('fails closed when Git cannot enumerate tracked files', async () => {
  await assert.rejects(
    checkTextPolicy('unused', {
      execFileImpl: async () => { throw new Error('enumeration unavailable') }
    }),
    /enumeration unavailable/
  )
})

test('fails closed when a tracked file cannot be read', async () => {
  await withRepository({ 'blocked.txt': 'ASCII\n' }, async (root) => {
    const diagnostics = await checkTextPolicy(root, {
      readFileImpl: async () => { throw new Error('access denied') }
    })
    assert.equal(diagnostics.length, 1)
    assert.match(diagnostics[0], /^blocked\.txt: could not read tracked bytes:/)
    assert.match(diagnostics[0], /access denied/)
  })
})
