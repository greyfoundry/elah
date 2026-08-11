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

import { lstat, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { ClientLaboratoryError } from '../client/compatibility.mjs'
import { verifyFoliaBaselineBundle } from './evidence.mjs'

const MAX_JSON_BYTES = 64 * 1024 * 1024
const EXPECTED_REFERENCES = Object.freeze({
  client: 'client-report.json',
  standard: 'observer-standard.json',
  deep: 'observer-deep.json',
  before: 'world-before.json',
  after: 'world-after.json'
})

export async function verifyFoliaBaselineReport (reportPath) {
  if (typeof reportPath !== 'string' || reportPath.trim() === '') {
    throw new ClientLaboratoryError('report_path', 'Folia baseline report path is required')
  }
  const absoluteReport = resolve(reportPath)
  const bundle = await readBoundedJson(absoluteReport)
  assertExpectedReferences(bundle)
  const directory = dirname(absoluteReport)
  const [client, standard, deep, before, after] = await Promise.all([
    readBoundedJson(join(directory, EXPECTED_REFERENCES.client)),
    readBoundedJson(join(directory, EXPECTED_REFERENCES.standard)),
    readBoundedJson(join(directory, EXPECTED_REFERENCES.deep)),
    readBoundedJson(join(directory, EXPECTED_REFERENCES.before)),
    readBoundedJson(join(directory, EXPECTED_REFERENCES.after))
  ])
  verifyFoliaBaselineBundle({ bundle, client, standard, deep, before, after })
  return bundle
}

async function readBoundedJson (path) {
  const metadata = await lstat(path)
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size < 1 || metadata.size > MAX_JSON_BYTES) {
    throw new ClientLaboratoryError('report_file', `Evidence path is not a bounded regular file: ${path}`)
  }
  let value
  try {
    value = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new ClientLaboratoryError('report_json', `Evidence path does not contain valid JSON: ${path}`, { cause: error })
  }
  return value
}

function assertExpectedReferences (bundle) {
  const actual = {
    client: bundle?.clientEvidence?.artifact?.path,
    standard: bundle?.observerEvidence?.standard?.artifact?.path,
    deep: bundle?.observerEvidence?.deep?.artifact?.path,
    before: bundle?.worldIntegrity?.before?.artifact?.path,
    after: bundle?.worldIntegrity?.after?.artifact?.path
  }
  for (const [name, expected] of Object.entries(EXPECTED_REFERENCES)) {
    if (actual[name] !== expected) {
      throw new ClientLaboratoryError('report_reference', `Folia baseline ${name} artifact path is not ${expected}`)
    }
  }
}

async function main () {
  if (process.argv.length !== 3) {
    throw new ClientLaboratoryError('report_argument', 'Usage: node lab/folia/verify-report.mjs <report.json>')
  }
  await verifyFoliaBaselineReport(process.argv[2])
  process.stdout.write('Folia baseline evidence verified\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`Folia baseline verification failed: ${error.message}\n`)
    process.exitCode = 1
  })
}
