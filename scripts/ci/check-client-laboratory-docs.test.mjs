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
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import { CLIENT_LABORATORY_DOCUMENT_PATHS, checkClientLaboratoryDocs } from './check-client-laboratory-docs.mjs'

const VALID_CONTRACT = `
Elah 0.0.4 Client Laboratory uses Mineflayer 4.37.1 with Minecraft 1.21.11 and Paper build 132.
The real Paper server gate records elah.client-laboratory/v1 evidence for 32 sessions in two waves.
Movement is server-observed movement from Paper console position queries.
Minecraft 26.2 is not qualified because upstream client support remains unresolved.
This development-only laboratory is not production-ready and does not prove Folia, ownership,
storage, failover, gameplay, a playable cluster, or a supported operator deployment.
`

async function withDocs (run) {
  const root = await mkdtemp(join(tmpdir(), 'elah-client-docs-'))
  try {
    for (const path of CLIENT_LABORATORY_DOCUMENT_PATHS) {
      const destination = join(root, path)
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, VALID_CONTRACT, 'utf8')
    }
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('accepts controlled documents containing every bounded release claim', async () => {
  await withDocs(async (root) => {
    await assert.doesNotReject(checkClientLaboratoryDocs({ root }))
  })
})

test('rejects missing evidence and inflated Mineflayer claims', async () => {
  await withDocs(async (root) => {
    await writeFile(
      join(root, 'docs/releases/0.0.4-client-laboratory.md'),
      'Mineflayer proves Folia production readiness and gameplay compatibility.\n',
      'utf8'
    )
    await assert.rejects(checkClientLaboratoryDocs({ root }), /unsupported Mineflayer claim/i)
  })
})

test('rejects a contract with the real-server or 26.2 boundary removed', async () => {
  await withDocs(async (root) => {
    for (const path of CLIENT_LABORATORY_DOCUMENT_PATHS) {
      await writeFile(
        join(root, path),
        VALID_CONTRACT.replace('real Paper server', 'fixture').replace('26.2 is not qualified', '26.2'),
        'utf8'
      )
    }
    await assert.rejects(checkClientLaboratoryDocs({ root }), /real Paper server/i)
  })
})
