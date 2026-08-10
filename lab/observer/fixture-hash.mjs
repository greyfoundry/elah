// ╔══════════════════════════════════════════════════════════════════╗
// ║                                                                  ║
// ║                   ELAH — A GREYFOUNDRY PROJECT                   ║
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

import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

export async function inventoryFiles (root) {
  const resolvedRoot = resolve(root)
  const paths = []
  await collect(resolvedRoot, resolvedRoot, paths)
  paths.sort((left, right) => left.localeCompare(right, 'en'))
  return Promise.all(paths.map(async path => {
    const bytes = await readFile(path)
    return {
      path: normalize(relative(resolvedRoot, path)),
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex')
    }
  }))
}

async function collect (root, directory, paths) {
  const entries = await readdir(directory, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      throw new Error(`fixture inventory rejected symbolic link: ${normalize(relative(root, resolve(directory, entry.name)))}`)
    }
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      await collect(root, path, paths)
    } else if (entry.isFile()) {
      paths.push(path)
    } else {
      throw new Error(`fixture inventory rejected special entry: ${normalize(relative(root, path))}`)
    }
  }
}

function normalize (path) {
  return sep === '/' ? path : path.split(sep).join('/')
}
