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

import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'

import { ClientLaboratoryError } from '../client/compatibility.mjs'

export async function downloadPinnedServer ({ destination, fetchImpl = fetch, source }) {
  const validated = validateSource(source)
  const existing = await inspectExisting(destination, validated)
  if (existing) return existing

  await mkdir(dirname(destination), { recursive: true })
  const temporary = `${destination}.${randomUUID()}.partial`
  let handle

  try {
    const response = await fetchImpl(validated.url, { redirect: 'manual' })
    if (response.status >= 300 && response.status < 400) {
      throw new ClientLaboratoryError('server_redirect', `${validated.label} download redirects are not permitted`)
    }
    if (response.status !== 200) {
      throw new ClientLaboratoryError(
        'server_http_status',
        `${validated.label} download returned status ${response.status}`
      )
    }

    const contentLength = parseContentLength(response.headers.get('content-length'))
    if (contentLength > validated.maxBytes) {
      throw new ClientLaboratoryError('server_size_limit', `${validated.label} declared size exceeds the fixed size limit`)
    }
    if (validated.expectedBytes !== undefined && contentLength !== validated.expectedBytes) {
      throw new ClientLaboratoryError(
        'server_published_size',
        `${validated.label} content-length does not match the pinned published byte size`
      )
    }
    if (response.body === null) {
      throw new ClientLaboratoryError('server_empty_body', `${validated.label} response has no body`)
    }

    handle = await open(temporary, 'wx')
    const hash = createHash('sha256')
    let bytes = 0
    for await (const rawChunk of response.body) {
      const chunk = Buffer.from(rawChunk)
      bytes += chunk.byteLength
      if (bytes > validated.maxBytes) {
        throw new ClientLaboratoryError('server_size_limit', `${validated.label} streamed size exceeds the fixed size limit`)
      }
      hash.update(chunk)
      await handle.write(chunk)
    }
    if (bytes !== contentLength) {
      throw new ClientLaboratoryError(
        'server_truncated',
        `${validated.label} response was truncated: body length does not match content-length`
      )
    }
    if (validated.expectedBytes !== undefined && bytes !== validated.expectedBytes) {
      throw new ClientLaboratoryError(
        'server_published_size',
        `${validated.label} body does not match the pinned published byte size`
      )
    }

    const sha256 = hash.digest('hex')
    if (sha256 !== validated.sha256) {
      throw new ClientLaboratoryError(
        'server_checksum',
        `${validated.label} checksum does not match the pinned SHA-256`
      )
    }

    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(temporary, destination)
    return { path: destination, sha256, bytes }
  } catch (error) {
    if (handle) await handle.close().catch(() => {})
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

function validateSource (source) {
  if (source === null || typeof source !== 'object') {
    throw new ClientLaboratoryError('invalid_server_source', 'server source metadata is required')
  }
  let url
  try {
    url = new URL(source.url)
  } catch {
    throw new ClientLaboratoryError('invalid_server_source', 'server URL is invalid')
  }
  if (url.protocol !== 'https:') {
    throw new ClientLaboratoryError('invalid_server_source', 'server URL must use HTTPS')
  }
  if (!/^[a-f0-9]{64}$/.test(source.sha256)) {
    throw new ClientLaboratoryError('invalid_server_source', 'server SHA-256 must be lowercase hexadecimal')
  }
  if (!Number.isSafeInteger(source.maxBytes) || source.maxBytes < 1) {
    throw new ClientLaboratoryError('invalid_server_source', 'server size limit must be a positive safe integer')
  }
  if (
    source.expectedBytes !== undefined &&
    (!Number.isSafeInteger(source.expectedBytes) || source.expectedBytes < 1 || source.expectedBytes > source.maxBytes)
  ) {
    throw new ClientLaboratoryError('invalid_server_source', 'published server bytes must fit the fixed size limit')
  }
  if (typeof source.artifactName !== 'string' || source.artifactName.trim() === '') {
    throw new ClientLaboratoryError('invalid_server_source', 'server artifact name must be nonblank')
  }
  const label = typeof source.label === 'string' && /^[A-Za-z][A-Za-z0-9 ]{0,31}$/.test(source.label)
    ? source.label
    : 'server'
  return {
    url: url.href,
    sha256: source.sha256,
    maxBytes: source.maxBytes,
    expectedBytes: source.expectedBytes,
    artifactName: source.artifactName,
    label
  }
}

function parseContentLength (value) {
  if (value === null || !/^[0-9]+$/.test(value)) {
    throw new ClientLaboratoryError('server_content_length', 'server response requires a numeric content-length')
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new ClientLaboratoryError('server_content_length', 'server content-length must be a positive safe integer')
  }
  return parsed
}

async function inspectExisting (destination, source) {
  let metadata
  try {
    metadata = await lstat(destination)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.size > source.maxBytes ||
    (source.expectedBytes !== undefined && metadata.size !== source.expectedBytes)
  ) {
    throw new ClientLaboratoryError(
      'existing_server_mismatch',
      `existing ${source.label} artifact is not the pinned regular non-symlink file`
    )
  }
  const bytes = await readFile(destination)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== source.sha256) {
    throw new ClientLaboratoryError(
      'existing_server_mismatch',
      `existing ${source.label} artifact checksum does not match`
    )
  }
  return { path: destination, sha256, bytes: bytes.byteLength }
}
