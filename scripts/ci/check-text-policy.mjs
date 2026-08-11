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

import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const forbiddenBytes = Buffer.from([0xe2, 0x80, 0x94])
const maximumGitOutputBytes = 16 * 1024 * 1024
const maximumDiagnosticDetail = 200

export async function checkTextPolicy (root = process.cwd(), overrides = {}) {
  const repositoryRoot = resolve(root)
  const execFileImpl = overrides.execFileImpl ?? execFileAsync
  const readFileImpl = overrides.readFileImpl ?? readFile
  const { stdout } = await execFileImpl('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    encoding: 'buffer',
    maxBuffer: maximumGitOutputBytes
  })
  const output = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout ?? '')
  const files = output
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((file) => file.replaceAll('\\', '/'))
    .sort()

  const diagnostics = []
  for (const file of files) {
    let contents
    try {
      contents = await readFileImpl(join(repositoryRoot, file))
    } catch (error) {
      diagnostics.push(`${file}: could not read tracked bytes: ${boundedError(error)}`)
      continue
    }
    const bytes = Buffer.isBuffer(contents) ? contents : Buffer.from(contents)
    const occurrences = countOccurrences(bytes, forbiddenBytes)
    if (occurrences > 0) {
      diagnostics.push(
        `${file}: contains ${occurrences} forbidden U+2014 byte sequence${occurrences === 1 ? '' : 's'}`
      )
    }
  }
  return diagnostics
}

function countOccurrences (contents, needle) {
  let occurrences = 0
  let offset = 0
  while (offset <= contents.length - needle.length) {
    const found = contents.indexOf(needle, offset)
    if (found === -1) break
    occurrences += 1
    offset = found + needle.length
  }
  return occurrences
}

function boundedError (error) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/[\r\n]+/g, ' ').slice(0, maximumDiagnosticDetail)
}

async function main () {
  const diagnostics = await checkTextPolicy()
  if (diagnostics.length > 0) {
    process.stderr.write(`${diagnostics.join('\n')}\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`Text policy check failed closed: ${boundedError(error)}\n`)
    process.exitCode = 1
  })
}
