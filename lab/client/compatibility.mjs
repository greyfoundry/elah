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

const PAPER_SHA256 = '8de7c52c3b02403503d16fac58003f1efef7dd7a0256786843927fa92ee57f1e'
const PAPER_URL = `https://fill-data.papermc.io/v1/objects/${PAPER_SHA256}/paper-1.21.8-60.jar`

export class ClientLaboratoryError extends Error {
  constructor (kind, summary, options) {
    super(summary, options)
    this.name = 'ClientLaboratoryError'
    this.kind = kind
  }
}
export const CLIENT_LAB_COMPATIBILITY = Object.freeze({
  mineflayerVersion: '4.37.1',
  minecraftVersion: '1.21.8',
  paperBuild: 60,
  paperFile: 'paper-1.21.8-60.jar',
  paperUrl: PAPER_URL,
  paperSha256: PAPER_SHA256,
  paperMaxBytes: 64 * 1024 * 1024,
  waves: 2,
  concurrency: 16,
  minimumHorizontalDisplacement: 0.5,
  connectTimeoutMillis: 30_000,
  spawnTimeoutMillis: 60_000,
  movementMillis: 2_000,
  endTimeoutMillis: 15_000,
  paperStartupTimeoutMillis: 180_000,
  paperCommandTimeoutMillis: 15_000,
  paperStopTimeoutMillis: 60_000,
  maximumDiagnosticLines: 500
})

export function assertCompatibility ({ mineflayerVersion, minecraftVersion } = {}) {
  if (
    mineflayerVersion !== CLIENT_LAB_COMPATIBILITY.mineflayerVersion ||
    minecraftVersion !== CLIENT_LAB_COMPATIBILITY.minecraftVersion
  ) {
    throw new ClientLaboratoryError(
      'unsupported_compatibility',
      `qualified tuple is Mineflayer ${CLIENT_LAB_COMPATIBILITY.mineflayerVersion} with Minecraft ${CLIENT_LAB_COMPATIBILITY.minecraftVersion}`
    )
  }
}

export function assertLoopbackHost (host) {
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
    throw new ClientLaboratoryError(
      'unsafe_endpoint',
      'Client Laboratory permits loopback endpoints only'
    )
  }
}

export function assertPinnedPaperSource ({ url, sha256, maxBytes } = {}) {
  if (
    url !== PAPER_URL ||
    sha256 !== PAPER_SHA256 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes !== CLIENT_LAB_COMPATIBILITY.paperMaxBytes
  ) {
    throw new ClientLaboratoryError(
      'unsafe_paper_source',
      'Paper source must match the pinned 1.21.8 build 60 object and limits'
    )
  }
}
