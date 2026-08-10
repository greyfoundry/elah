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

import assert from 'node:assert/strict'

export function verifyReports (truth, standard, deep) {
  assert.equal(standard.schema, 'elah.observe/v1', 'standard report schema')
  assert.equal(deep.schema, 'elah.observe/v1', 'deep report schema')
  assert.equal(standard.world.level_name, truth.levelName, 'standard saved level name')
  assert.equal(deep.world.level_name, truth.levelName, 'deep saved level name')
  assert.equal(standard.world.data_version, truth.dataVersion, 'standard data version')
  assert.equal(deep.world.data_version, truth.dataVersion, 'deep data version')
  assert.equal(standard.scan.depth, 'standard', 'standard scan depth')
  assert.equal(standard.scan.consistent, true, 'standard consistency')
  assert.equal(standard.scan.content_nbt_decoded, false, 'standard does not claim chunk decode')
  assert.equal(deep.scan.depth, 'deep', 'deep scan depth')
  assert.equal(deep.scan.consistent, true, 'deep consistency')
  assert.equal(deep.scan.content_nbt_decoded, true, 'deep confirms chunk decode')
  assert.equal(standard.totals.occupied_chunks, truth.chunks.length, 'standard occupied chunks')
  assert.equal(deep.totals.occupied_chunks, truth.chunks.length, 'deep occupied chunks')
  assert.equal(deep.deep_validation.decoded_chunks, truth.chunks.length, 'deep decoded chunks')
  assert.deepEqual(projectTotals(standard), projectTotals(deep), 'standard and deep structural totals')

  const expectedDimensions = counts(truth.chunks, chunk => chunk.dimension)
  assert.deepEqual(dimensionCounts(standard), expectedDimensions, 'standard dimension counts')
  assert.deepEqual(dimensionCounts(deep), expectedDimensions, 'deep dimension counts')
  assert.deepEqual(
    deep.deep_validation.data_versions,
    distributions(truth.chunks, chunk => chunk.dataVersion, true),
    'deep data-version distribution'
  )
  assert.deepEqual(
    deep.deep_validation.statuses,
    distributions(truth.chunks, chunk => chunk.status, false),
    'deep status distribution'
  )
  return {
    schema: 'elah.observer-comparison/v1',
    standardDeepAgreement: true,
    occupiedChunks: truth.chunks.length,
    dataVersions: deep.deep_validation.data_versions,
    statuses: deep.deep_validation.statuses
  }
}

function projectTotals (report) {
  return {
    logical_bytes: report.totals.logical_bytes,
    region_bytes: report.totals.region_bytes,
    region_files: report.totals.region_files,
    occupied_chunks: report.totals.occupied_chunks
  }
}

function dimensionCounts (report) {
  return Object.fromEntries(report.dimensions.map(dimension => [dimension.id, dimension.occupied_chunks]))
}

function counts (values, select) {
  const result = {}
  for (const value of values) {
    const key = String(select(value))
    result[key] = (result[key] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right, 'en')))
}

function distributions (values, select, numeric) {
  return Object.entries(counts(values, select))
    .map(([value, count]) => ({ value: numeric ? Number(value) : value, count }))
    .sort((left, right) => numeric ? left.value - right.value : left.value.localeCompare(right.value, 'en'))
}
