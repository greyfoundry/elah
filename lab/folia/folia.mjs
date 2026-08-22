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
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ClientLaboratoryError } from '../client/compatibility.mjs'
import { MinecraftServerLaboratory } from '../server/minecraft-server.mjs'
import { FOLIA_BASELINE_COMPATIBILITY, assertPinnedFoliaSource } from './compatibility.mjs'

const usernamePattern = /^elah_lab_[0-9]{3}$/
const numberPattern = '[-+]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][-+]?[0-9]+)?'

export class FoliaLaboratory extends MinecraftServerLaboratory {
  #root
  #commandTimeoutMillis

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
    this.#root = options.root
    this.#commandTimeoutMillis = compatibility.serverCommandTimeoutMillis
  }

  async start () {
    await mkdir(this.#root, { recursive: true })
    await writeFile(
      join(this.#root, 'ops.json'),
      `${JSON.stringify(operatorEntries(), null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx' }
    )
    await super.start()
  }

  async queryPosition (username, bot) {
    if (!usernamePattern.test(username) || bot?.username !== username) {
      throw new ClientLaboratoryError('unsafe_username', 'Folia position probe requires the matching laboratory player')
    }
    if (
      typeof bot?.on !== 'function' ||
      typeof bot?.removeListener !== 'function' ||
      typeof bot?.chat !== 'function'
    ) {
      throw new ClientLaboratoryError('folia_player_probe', 'Folia position probe requires player command controls')
    }

    let timer
    let listener
    const marker = `ELAH_POS ${username} `
    const positionPattern = new RegExp(
      `^${marker}\\[(${numberPattern})[dDfF]?,\\s*(${numberPattern})[dDfF]?,\\s*(${numberPattern})[dDfF]?\\]$`
    )
    const response = new Promise((resolve, reject) => {
      listener = (message) => {
        const values = String(message).match(positionPattern)
        if (!values) return
        const position = { x: Number(values[1]), y: Number(values[2]), z: Number(values[3]) }
        if (!Object.values(position).every(Number.isFinite)) {
          reject(new ClientLaboratoryError('folia_position_response', 'Folia returned non-finite player coordinates'))
          return
        }
        resolve(position)
      }
      bot.on('messagestr', listener)
      timer = setTimeout(() => reject(new ClientLaboratoryError(
        'folia_position_timeout',
        `Folia player position query timed out for ${username}`
      )), this.#commandTimeoutMillis)
    })
    try {
      bot.chat(`/tellraw @s ${JSON.stringify({
        text: marker,
        extra: [{ nbt: 'Pos', entity: '@s' }]
      })}`)
      return await response
    } finally {
      clearTimeout(timer)
      bot.removeListener('messagestr', listener)
    }
  }
}

function operatorEntries () {
  return Array.from({ length: FOLIA_BASELINE_COMPATIBILITY.waves * FOLIA_BASELINE_COMPATIBILITY.concurrency }, (_, index) => {
    const name = `elah_lab_${String(index + 1).padStart(3, '0')}`
    return {
      uuid: offlineUuid(name),
      name,
      level: 4,
      bypassesPlayerLimit: false
    }
  })
}

function offlineUuid (username) {
  const bytes = createHash('md5').update(`OfflinePlayer:${username}`, 'utf8').digest()
  bytes[6] = (bytes[6] & 0x0f) | 0x30
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
