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

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

import minecraftData from 'minecraft-data'
import prismarineChunk from 'prismarine-chunk'
import prismarineNbt from 'prismarine-nbt'
import providerAnvil from 'prismarine-provider-anvil'

const MINECRAFT_VERSION = '1.21.1'
const FIXED_TIMESTAMP_SECONDS = 1_700_000_000

export async function createFixture (root, { small = false } = {}) {
  const registry = minecraftData(MINECRAFT_VERSION)
  if (!registry?.version?.dataVersion) {
    throw new Error(`minecraft-data does not know ${MINECRAFT_VERSION}`)
  }
  const dataVersion = registry.version.dataVersion
  const regionRoot = join(root, 'region')
  const netherRegionRoot = join(root, 'DIM-1', 'region')
  await Promise.all([
    mkdir(regionRoot, { recursive: true }),
    mkdir(netherRegionRoot, { recursive: true })
  ])
  await writeLevel(root, dataVersion)

  const chunks = [
    { dimension: 'minecraft:overworld', x: -1, z: -1, status: 'full', dataVersion },
    { dimension: 'minecraft:overworld', x: 0, z: 0, status: 'full', dataVersion },
    { dimension: 'minecraft:overworld', x: 32, z: 0, status: 'full', dataVersion },
    { dimension: 'minecraft:the_nether', x: 0, z: 0, status: 'full', dataVersion }
  ]
  if (!small) {
    for (let index = 1; index <= 12; index += 1) {
      chunks.push({
        dimension: 'minecraft:overworld',
        x: index,
        z: index % 4,
        status: index % 2 === 0 ? 'full' : 'minecraft:features',
        dataVersion
      })
    }
  }

  const Anvil = providerAnvil.Anvil(MINECRAFT_VERSION)
  const overworld = new Anvil(regionRoot)
  const nether = new Anvil(netherRegionRoot)
  try {
    for (const chunk of chunks) {
      const provider = chunk.dimension === 'minecraft:overworld' ? overworld : nether
      await provider.saveRaw(chunk.x, chunk.z, chunkTag(chunk))
    }

    const Chunk = prismarineChunk(registry)
    const semantic = new Chunk({ minY: -64, worldHeight: 384 })
    semantic.lastUpdate = [0, 0]
    semantic.inhabitedTime = [0, 0]
    await overworld.save(2, 3, semantic)
    chunks.push({
      dimension: 'minecraft:overworld',
      x: 2,
      z: 3,
      status: 'full',
      dataVersion
    })

    await verifySavedChunks(overworld, nether, chunks)
  } finally {
    await Promise.all([overworld.close(), nether.close()])
  }
  await normalizeRegionTimestamps(root)
  chunks.sort(compareChunks)
  return {
    schema: 'elah.observer-fixture/v1',
    minecraftVersion: MINECRAFT_VERSION,
    levelName: 'Observer Laboratory',
    dataVersion,
    chunks
  }
}

function chunkTag ({ x, z, status, dataVersion }) {
  return prismarineNbt.comp({
    DataVersion: prismarineNbt.int(dataVersion),
    Status: prismarineNbt.string(status),
    xPos: prismarineNbt.int(x),
    zPos: prismarineNbt.int(z)
  })
}

async function writeLevel (root, dataVersion) {
  const level = prismarineNbt.comp({
    Data: prismarineNbt.comp({
      LevelName: prismarineNbt.string('Observer Laboratory'),
      DataVersion: prismarineNbt.int(dataVersion),
      LastPlayed: prismarineNbt.long([0, FIXED_TIMESTAMP_SECONDS]),
      Version: prismarineNbt.comp({
        Name: prismarineNbt.string(MINECRAFT_VERSION)
      })
    })
  })
  await writeFile(join(root, 'level.dat'), gzipSync(prismarineNbt.writeUncompressed(level), { mtime: 0 }))
  const parsed = await prismarineNbt.parse(await readFile(join(root, 'level.dat')), 'big')
  const simplified = prismarineNbt.simplify(parsed.parsed)
  if (simplified.Data.LevelName !== 'Observer Laboratory' || simplified.Data.DataVersion !== dataVersion) {
    throw new Error('Prismarine level.dat round-trip did not preserve fixture truth')
  }
}

async function verifySavedChunks (overworld, nether, chunks) {
  for (const chunk of chunks) {
    const provider = chunk.dimension === 'minecraft:overworld' ? overworld : nether
    const loaded = await provider.loadRaw(chunk.x, chunk.z)
    const simplified = prismarineNbt.simplify(loaded)
    if (
      simplified.xPos !== chunk.x ||
      simplified.zPos !== chunk.z ||
      simplified.DataVersion !== chunk.dataVersion ||
      simplified.Status !== chunk.status
    ) {
      throw new Error(`Prismarine chunk round-trip disagreed at ${chunk.dimension} ${chunk.x},${chunk.z}`)
    }
  }
}

async function normalizeRegionTimestamps (root) {
  for (const directory of [join(root, 'region'), join(root, 'DIM-1', 'region')]) {
    const names = (await readdir(directory)).filter(name => name.endsWith('.mca')).sort()
    for (const name of names) {
      const path = join(directory, name)
      const bytes = await readFile(path)
      for (let index = 0; index < 1024; index += 1) {
        bytes.writeUInt32BE(FIXED_TIMESTAMP_SECONDS, 4096 + index * 4)
      }
      await writeFile(path, bytes)
    }
  }
}

function compareChunks (left, right) {
  return left.dimension.localeCompare(right.dimension, 'en') || left.x - right.x || left.z - right.z
}
