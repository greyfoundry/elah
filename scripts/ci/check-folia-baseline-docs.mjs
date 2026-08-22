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

export const FOLIA_BASELINE_DOCUMENT_PATHS = Object.freeze([
  'README.md',
  'ROADMAP.md',
  'ARCHITECTURE.md',
  'docs/architecture/repository-map.md',
  'docs/development/ci.md',
  'docs/development/folia-baseline-laboratory.md',
  'docs/releases/0.0.5-folia-baseline-laboratory.md'
])

const REQUIRED_CLAIMS = Object.freeze([
  ['0.0.5 Folia Baseline Laboratory', /0\.0\.5[\s\S]{0,80}Folia Baseline Laboratory/i],
  ['Folia 1.21.8 build 6', /Folia 1\.21\.8 build 6/i],
  ['pinned Folia commit', /612d9bd8569fe1a6008a05325af3fad66ef1cef7/],
  ['Mineflayer 4.37.1', /Mineflayer 4\.37\.1/],
  ['32 sessions', /32 sessions/i],
  ['two sequential waves of 16', /two sequential waves of 16/i],
  ['server-observed movement', /server-observed movement/i],
  ['clean Folia shutdown', /clean Folia shutdown/i],
  ['standard Observer', /standard[^.\n]{0,80}Observer|Observer[^.\n]{0,80}standard/i],
  ['deep Observer', /deep[^.\n]{0,80}Observer|Observer[^.\n]{0,80}deep/i],
  ['unchanged world', /unchanged world|world immutability/i],
  ['elah.folia-baseline/v1', /elah\.folia-baseline\/v1/],
  ['functional-only boundary', /functional-only/i],
  ['performance non-goal', /does not prove[\s\S]{0,180}\bperformance/i],
  ['region parallelism non-goal', /does not prove[\s\S]{0,180}\bregion parallelism/i],
  ['Elah integration non-goal', /does not prove[\s\S]{0,180}\bElah integration/i],
  ['ownership non-goal', /does not prove[\s\S]{0,180}\bownership/i],
  ['handoff non-goal', /does not prove[\s\S]{0,180}\bhandoff/i],
  ['production readiness non-goal', /does not prove[\s\S]{0,240}\bproduction readiness/i]
])

const UNSUPPORTED_FOLIA_CLAIM = /\b(?:proves|demonstrates|guarantees|validates)\b[^.\n]{0,160}\b(?:Folia performance|region parallelism|Elah integration|production readiness)\b/i

export async function checkFoliaBaselineDocs ({ root = process.cwd() } = {}) {
  const documents = await Promise.all(FOLIA_BASELINE_DOCUMENT_PATHS.map(async (path) => ({
    path,
    text: await readFile(resolve(root, path), 'utf8')
  })))
  for (const { path, text } of documents) {
    if (UNSUPPORTED_FOLIA_CLAIM.test(text)) {
      throw new Error(`${path}: unsupported Folia claim inflates baseline evidence`)
    }
  }

  for (const requiredPath of ['README.md', 'ROADMAP.md']) {
    const text = documents.find(({ path }) => path === requiredPath).text
    if (!/0\.0\.5[\s\S]{0,80}Folia Baseline Laboratory/i.test(text)) {
      throw new Error(`${requiredPath}: missing current 0.0.5 Folia Baseline Laboratory identity`)
    }
  }

  const combined = documents.map(({ path, text }) => `\n# ${path}\n${text}`).join('\n')
  for (const [label, pattern] of REQUIRED_CLAIMS) {
    if (!pattern.test(combined)) throw new Error(`Folia baseline documentation is missing: ${label}`)
  }
}

async function main () {
  await checkFoliaBaselineDocs()
  process.stdout.write('Folia baseline documentation preserves qualified claims and non-goals.\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
