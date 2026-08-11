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
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import { FOLIA_BASELINE_DOCUMENT_PATHS, checkFoliaBaselineDocs } from './check-folia-baseline-docs.mjs'

const VALID_CONTRACT = `
Elah 0.0.5 Folia Baseline Laboratory pins Folia 1.21.8 build 6 at commit
612d9bd8569fe1a6008a05325af3fad66ef1cef7 with Mineflayer 4.37.1.
The development-only gate requires 32 sessions in two sequential waves of 16,
server-observed movement, clean Folia shutdown, standard and deep Observer reports,
and an unchanged world proven by complete before and after hashes.
Passing elah.folia-baseline/v1 evidence is functional-only compatibility evidence.
It does not prove performance, Folia region parallelism, Elah integration, ownership,
handoff, gameplay, a playable cluster, or production readiness.
`

async function withDocs (run) {
  const root = await mkdtemp(join(tmpdir(), 'elah-folia-docs-'))
  try {
    for (const path of FOLIA_BASELINE_DOCUMENT_PATHS) {
      const destination = join(root, path)
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, VALID_CONTRACT, 'utf8')
    }
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('accepts the exact bounded Folia release contract', async () => {
  await withDocs(async (root) => {
    await assert.doesNotReject(checkFoliaBaselineDocs({ root }))
  })
})

test('rejects stale README and roadmap release identities', async () => {
  await withDocs(async (root) => {
    await writeFile(join(root, 'README.md'), VALID_CONTRACT.replace('0.0.5', '0.0.4'), 'utf8')
    await assert.rejects(checkFoliaBaselineDocs({ root }), /README.*0\.0\.5/i)
  })
})

test('rejects missing world integrity and clean-shutdown claims', async () => {
  await withDocs(async (root) => {
    for (const path of FOLIA_BASELINE_DOCUMENT_PATHS) {
      await writeFile(
        join(root, path),
        VALID_CONTRACT.replace('clean Folia shutdown', 'server lifecycle')
          .replace('an unchanged world', 'a world'),
        'utf8'
      )
    }
    await assert.rejects(checkFoliaBaselineDocs({ root }), /clean Folia shutdown/i)
  })
})

test('rejects inflated performance or production claims', async () => {
  await withDocs(async (root) => {
    await writeFile(
      join(root, 'docs/releases/0.0.5-folia-baseline-laboratory.md'),
      `${VALID_CONTRACT}\nThis proves Folia performance and production readiness.\n`,
      'utf8'
    )
    await assert.rejects(checkFoliaBaselineDocs({ root }), /unsupported Folia claim/i)
  })
})
