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

import { MinecraftServerLaboratory } from '../server/minecraft-server.mjs'
import { FOLIA_BASELINE_COMPATIBILITY, assertPinnedFoliaSource } from './compatibility.mjs'

export class FoliaLaboratory extends MinecraftServerLaboratory {
  constructor (options) {
    const compatibility = options?.compatibility ?? FOLIA_BASELINE_COMPATIBILITY
    assertPinnedFoliaSource(compatibility)
    super({
      ...options,
      compatibility: undefined,
      serverName: 'Folia',
      kindPrefix: 'folia',
      motd: 'Elah Folia Baseline Laboratory',
      limits: {
        startupTimeoutMillis: compatibility.serverStartupTimeoutMillis,
        commandTimeoutMillis: compatibility.serverCommandTimeoutMillis,
        stopTimeoutMillis: compatibility.serverStopTimeoutMillis,
        maximumDiagnosticLines: compatibility.maximumDiagnosticLines,
        initialMemoryMiB: compatibility.initialMemoryMiB,
        maximumMemoryMiB: compatibility.maximumMemoryMiB
      }
    })
  }
}
