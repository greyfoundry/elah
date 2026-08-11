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

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const CLIENT_LABORATORY_DOCUMENT_PATHS = Object.freeze([
  'README.md',
  'ROADMAP.md',
  'ARCHITECTURE.md',
  'docs/development/ci.md',
  'docs/development/toolchains.md',
  'docs/development/client-laboratory.md',
  'docs/releases/0.0.4-client-laboratory.md'
])

const REQUIRED_CLAIMS = Object.freeze([
  ['0.0.4 Client Laboratory', /0\.0\.4\s+(?:\([^)]*Client Laboratory[^)]*\)|Client Laboratory)/i],
  ['Mineflayer 4.37.1', /Mineflayer 4\.37\.1/],
  ['Minecraft 1.21.11', /Minecraft 1\.21\.11/],
  ['Paper build 132', /Paper build 132/],
  ['real Paper server', /real Paper server/i],
  ['elah.client-laboratory/v1', /elah\.client-laboratory\/v1/],
  ['32 sessions', /32 sessions/i],
  ['two waves', /two (?:sequential )?waves/i],
  ['server-observed movement', /server-observed movement/i],
  ['26.2 is not qualified', /26\.2 is not qualified/i],
  ['development-only boundary', /development-only/i],
  ['Folia non-goal', /does not prove[\s\S]{0,200}\bFolia/i],
  ['ownership non-goal', /does not prove[\s\S]{0,200}\bownership/i],
  ['storage non-goal', /does not prove[\s\S]{0,200}\bstorage/i],
  ['failover non-goal', /does not prove[\s\S]{0,200}\bfailover/i],
  ['gameplay non-goal', /does not prove[\s\S]{0,200}\bgameplay/i]
])

const UNSUPPORTED_MINEFLAYER_CLAIM = /Mineflayer[^.\n]{0,160}(?:proves|validates|guarantees)[^.\n]{0,160}(?:Folia|production|gameplay)/i

export async function checkClientLaboratoryDocs ({ root = process.cwd() } = {}) {
  const documents = await Promise.all(CLIENT_LABORATORY_DOCUMENT_PATHS.map(async (path) => ({
    path,
    text: await readFile(resolve(root, path), 'utf8')
  })))
  for (const { path, text } of documents) {
    if (UNSUPPORTED_MINEFLAYER_CLAIM.test(text)) {
      throw new Error(`${path}: unsupported Mineflayer claim inflates Client Laboratory evidence`)
    }
  }

  const combined = documents.map(({ path, text }) => `\n# ${path}\n${text}`).join('\n')
  for (const [label, pattern] of REQUIRED_CLAIMS) {
    if (!pattern.test(combined)) {
      throw new Error(`Client Laboratory documentation is missing: ${label}`)
    }
  }
}

async function main () {
  await checkClientLaboratoryDocs()
  process.stdout.write('Client Laboratory documentation preserves qualified claims and non-goals.\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
