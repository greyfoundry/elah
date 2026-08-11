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

import { ClientLaboratoryError } from './compatibility.mjs'

export async function downloadPinnedPaper ({ destination, fetchImpl = fetch, compatibility }) {
  const source = validateSource(compatibility)
  const existing = await inspectExisting(destination, source)
  if (existing) return existing

  await mkdir(dirname(destination), { recursive: true })
  const temporary = `${destination}.${randomUUID()}.partial`
  let handle

  try {
    const response = await fetchImpl(source.url, { redirect: 'manual' })
    if (response.status >= 300 && response.status < 400) {
      throw new ClientLaboratoryError('paper_redirect', 'Paper download redirects are not permitted')
    }
    if (response.status !== 200) {
      throw new ClientLaboratoryError('paper_http_status', `Paper download returned status ${response.status}`)
    }

    const contentLength = parseContentLength(response.headers.get('content-length'))
    if (contentLength > source.maxBytes) {
      throw new ClientLaboratoryError('paper_size_limit', 'Paper declared size exceeds the fixed size limit')
    }
    if (response.body === null) {
      throw new ClientLaboratoryError('paper_empty_body', 'Paper response has no body')
    }

    handle = await open(temporary, 'wx')
    const hash = createHash('sha256')
    let bytes = 0
    for await (const rawChunk of response.body) {
      const chunk = Buffer.from(rawChunk)
      bytes += chunk.byteLength
      if (bytes > source.maxBytes) {
        throw new ClientLaboratoryError('paper_size_limit', 'Paper streamed size exceeds the fixed size limit')
      }
      hash.update(chunk)
      await handle.write(chunk)
    }
    if (bytes !== contentLength) {
      throw new ClientLaboratoryError(
        'paper_truncated',
        'Paper response was truncated: body length does not match content-length'
      )
    }

    const sha256 = hash.digest('hex')
    if (sha256 !== source.sha256) {
      throw new ClientLaboratoryError('paper_checksum', 'Paper checksum does not match the pinned SHA-256')
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

function validateSource (compatibility) {
  if (compatibility === null || typeof compatibility !== 'object') {
    throw new ClientLaboratoryError('invalid_paper_source', 'Paper compatibility metadata is required')
  }
  let url
  try {
    url = new URL(compatibility.paperUrl)
  } catch {
    throw new ClientLaboratoryError('invalid_paper_source', 'Paper URL is invalid')
  }
  if (url.protocol !== 'https:') {
    throw new ClientLaboratoryError('invalid_paper_source', 'Paper URL must use HTTPS')
  }
  if (!/^[a-f0-9]{64}$/.test(compatibility.paperSha256)) {
    throw new ClientLaboratoryError('invalid_paper_source', 'Paper SHA-256 must be lowercase hexadecimal')
  }
  if (!Number.isSafeInteger(compatibility.paperMaxBytes) || compatibility.paperMaxBytes < 1) {
    throw new ClientLaboratoryError('invalid_paper_source', 'Paper size limit must be a positive safe integer')
  }
  return {
    url: url.href,
    sha256: compatibility.paperSha256,
    maxBytes: compatibility.paperMaxBytes
  }
}

function parseContentLength (value) {
  if (value === null || !/^[0-9]+$/.test(value)) {
    throw new ClientLaboratoryError('paper_content_length', 'Paper response requires a numeric content-length')
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new ClientLaboratoryError('paper_content_length', 'Paper content-length must be a positive safe integer')
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
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > source.maxBytes) {
    throw new ClientLaboratoryError('existing_paper_mismatch', 'existing Paper artifact is not the pinned file')
  }
  const bytes = await readFile(destination)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== source.sha256) {
    throw new ClientLaboratoryError('existing_paper_mismatch', 'existing Paper artifact checksum does not match')
  }
  return { path: destination, sha256, bytes: bytes.byteLength }
}
