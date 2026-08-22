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

import { ClientLaboratoryError } from '../client/compatibility.mjs'

const artifactSha256 = '233843cfd5001b6f658fcab549178d694cc37f0277d004ea295de0a94c57278f'
const artifactUrl = `https://fill-data.papermc.io/v1/objects/${artifactSha256}/folia-1.21.8-6.jar`

export const FOLIA_BASELINE_COMPATIBILITY = Object.freeze({
  serverKind: 'folia',
  minecraftVersion: '1.21.8',
  mineflayerVersion: '4.37.1',
  foliaBuild: 6,
  foliaCommit: '612d9bd8569fe1a6008a05325af3fad66ef1cef7',
  artifactFile: 'folia-1.21.8-6.jar',
  artifactUrl,
  artifactSha256,
  artifactBytes: 53_064_151,
  artifactMaxBytes: 64 * 1024 * 1024,
  waves: 2,
  concurrency: 16,
  minimumHorizontalDisplacement: 0.5,
  connectTimeoutMillis: 30_000,
  spawnTimeoutMillis: 60_000,
  movementMillis: 2_000,
  endTimeoutMillis: 15_000,
  serverStartupTimeoutMillis: 180_000,
  serverCommandTimeoutMillis: 15_000,
  serverStopTimeoutMillis: 60_000,
  maximumDiagnosticLines: 500,
  initialMemoryMiB: 512,
  maximumMemoryMiB: 1536
})

export function assertPinnedFoliaSource (candidate) {
  if (
    candidate === null ||
    typeof candidate !== 'object' ||
    Object.keys(FOLIA_BASELINE_COMPATIBILITY).some(
      (key) => candidate[key] !== FOLIA_BASELINE_COMPATIBILITY[key]
    ) ||
    Object.keys(candidate).some((key) => !(key in FOLIA_BASELINE_COMPATIBILITY))
  ) {
    throw new ClientLaboratoryError(
      'unsafe_folia_source',
      'compatibility must match the pinned Folia 1.21.8 build 6 baseline tuple'
    )
  }
}
