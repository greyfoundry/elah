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

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

import { ClientLaboratoryError } from '../client/compatibility.mjs'

const DEFAULT_LIMITS = Object.freeze({
  maximumFiles: 50_000,
  maximumTotalBytes: 8 * 1024 * 1024 * 1024,
  maximumFileBytes: 2 * 1024 * 1024 * 1024,
  maximumPathBytes: 4096
})

export async function hashWorldTree (root, limits = {}) {
  const boundary = validateBoundary(root, limits)
  const rootPath = resolve(root)
  const rootStat = await lstat(rootPath)
  if (rootStat.isSymbolicLink()) fail('world_symlink', 'World integrity scan rejects symlinks')
  if (!rootStat.isDirectory()) fail('invalid_world', 'World integrity root must be a directory')

  const paths = []
  await collectPaths(rootPath, rootPath, paths, boundary)
  paths.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)))

  const rootDigest = createHash('sha256')
  const files = []
  let regularBytes = 0
  for (const path of paths) {
    const absolutePath = resolve(rootPath, ...path.split('/'))
    const before = await lstat(absolutePath, { bigint: true })
    if (!before.isFile()) fail('world_changed', `World entry changed during integrity scan: ${path}`)
    const bytes = Number(before.size)
    if (!Number.isSafeInteger(bytes)) fail('world_limit', 'World file size exceeds the safe integer limit')
    if (bytes > boundary.maximumFileBytes) fail('world_limit', `World individual file limit exceeded: ${path}`)
    regularBytes += bytes
    if (regularBytes > boundary.maximumTotalBytes) fail('world_limit', 'World total byte limit exceeded')

    const sha256 = await hashFile(absolutePath)
    const after = await lstat(absolutePath, { bigint: true })
    if (!sameFileState(before, after)) fail('world_changed', `World entry changed during integrity scan: ${path}`)
    frameFile(rootDigest, path, bytes, sha256)
    files.push({ path, bytes, sha256 })
  }

  return {
    schema: 'elah.world-tree/v1',
    rootSha256: rootDigest.digest('hex'),
    regularFileCount: files.length,
    regularBytes,
    files
  }
}

export function assertWorldUnchanged (before, after) {
  if (
    before?.schema !== 'elah.world-tree/v1' ||
    after?.schema !== 'elah.world-tree/v1' ||
    JSON.stringify(before) !== JSON.stringify(after)
  ) {
    fail('world_changed', 'Observed world changed during the stopped-world integrity window')
  }
}

async function collectPaths (rootPath, directory, paths, limits) {
  const entries = await readdir(directory, { withFileTypes: true })
  entries.sort((left, right) => Buffer.from(left.name).compare(Buffer.from(right.name)))
  for (const entry of entries) {
    const absolutePath = resolve(directory, entry.name)
    const path = relative(rootPath, absolutePath).split(sep).join('/')
    if (Buffer.byteLength(path, 'utf8') > limits.maximumPathBytes) {
      fail('world_limit', `World path byte limit exceeded: ${path}`)
    }
    const stat = await lstat(absolutePath)
    if (stat.isSymbolicLink()) fail('world_symlink', `World integrity scan rejects symlink: ${path}`)
    if (stat.isDirectory()) {
      await collectPaths(rootPath, absolutePath, paths, limits)
    } else if (stat.isFile()) {
      paths.push(path)
      if (paths.length > limits.maximumFiles) fail('world_limit', 'World file count limit exceeded')
    } else {
      fail('world_entry_type', `World integrity scan rejects non-regular entry: ${path}`)
    }
  }
}

async function hashFile (path) {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(path)) digest.update(chunk)
  return digest.digest('hex')
}

function frameFile (digest, path, bytes, sha256) {
  const pathBytes = Buffer.from(path, 'utf8')
  const pathLength = Buffer.allocUnsafe(4)
  pathLength.writeUInt32BE(pathBytes.length)
  const fileLength = Buffer.allocUnsafe(8)
  fileLength.writeBigUInt64BE(BigInt(bytes))
  digest.update(pathLength)
  digest.update(pathBytes)
  digest.update(fileLength)
  digest.update(Buffer.from(sha256, 'hex'))
}

function sameFileState (before, after) {
  return before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mtimeNs === after.mtimeNs &&
    before.ctimeNs === after.ctimeNs
}

function validateBoundary (root, limits) {
  if (typeof root !== 'string' || root.trim() === '') fail('invalid_world', 'World integrity root is required')
  const boundary = { ...DEFAULT_LIMITS, ...limits }
  for (const [name, value] of Object.entries(boundary)) {
    if (!Number.isSafeInteger(value) || value < 1) fail('invalid_limit', `${name} must be a positive safe integer`)
  }
  return boundary
}

function fail (kind, summary) {
  throw new ClientLaboratoryError(kind, summary)
}
