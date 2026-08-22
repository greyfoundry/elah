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

import assert from 'node:assert/strict'
import test from 'node:test'

import { REQUIRED_STAGES } from '../../client/ledger.mjs'
import { FOLIA_BASELINE_COMPATIBILITY } from '../compatibility.mjs'
import {
  FoliaBaselineLedger,
  artifactReference,
  verifyFoliaBaselineBundle
} from '../evidence.mjs'

function clientReport () {
  const sessions = Array.from({ length: 32 }, (_, index) => ({
    sessionId: `session-${String(index + 1).padStart(3, '0')}`,
    username: `elah_lab_${String(index + 1).padStart(3, '0')}`,
    wave: index < 16 ? 1 : 2,
    horizontalDisplacement: 1,
    stages: REQUIRED_STAGES.map((name, stage) => ({ name, atMillis: stage }))
  }))
  return {
    schema: 'elah.client-laboratory/v1',
    outcome: 'passed',
    compatibility: structuredClone(FOLIA_BASELINE_COMPATIBILITY),
    requestedWaves: 2,
    completedWaves: 2,
    concurrency: 16,
    requestedSessions: 32,
    completedSessions: 32,
    serverCleanup: { requested: true, exitCode: 0, atMillis: 1 },
    fixtureLifecycle: { readyObserved: true, cleanStopRequested: true, exitCode: 0, signal: null },
    stageCounts: Object.fromEntries(REQUIRED_STAGES.map((stage) => [stage, 32])),
    sessions
  }
}

function observer (depth) {
  return {
    schema: 'elah.observe/v1',
    observer_version: '0.0.5',
    scan: { depth, consistent: true, content_nbt_decoded: depth === 'deep' }
  }
}

function world () {
  return {
    schema: 'elah.world-tree/v1',
    rootSha256: 'a'.repeat(64),
    regularFileCount: 1,
    regularBytes: 4,
    files: [{ path: 'level.dat', bytes: 4, sha256: 'b'.repeat(64) }]
  }
}

function validInputs () {
  const client = clientReport()
  const standard = observer('standard')
  const deep = observer('deep')
  const before = world()
  const after = structuredClone(before)
  return { client, standard, deep, before, after }
}

function finalize (inputs = validInputs()) {
  const ledger = new FoliaBaselineLedger({ compatibility: FOLIA_BASELINE_COMPATIBILITY })
  ledger.recordArtifact({
    file: FOLIA_BASELINE_COMPATIBILITY.artifactFile,
    bytes: FOLIA_BASELINE_COMPATIBILITY.artifactBytes,
    sha256: FOLIA_BASELINE_COMPATIBILITY.artifactSha256
  })
  ledger.recordEnvironment({ os: 'linux', arch: 'x64', nodeVersion: '24.19.0', javaMajor: 21 })
  ledger.recordClient(inputs.client, artifactReference('client-report.json', inputs.client))
  ledger.recordObservers({
    standard: inputs.standard,
    deep: inputs.deep,
    standardRef: artifactReference('observer-standard.json', inputs.standard),
    deepRef: artifactReference('observer-deep.json', inputs.deep)
  })
  ledger.recordWorld({
    before: inputs.before,
    after: inputs.after,
    beforeRef: artifactReference('world-before.json', inputs.before),
    afterRef: artifactReference('world-after.json', inputs.after)
  })
  ledger.recordDurations({ downloadMillis: 1, clientMillis: 2, observerMillis: 3, totalMillis: 6 })
  return ledger.finalize()
}

test('finalizes only complete exact evidence and independently verifies every artifact digest', () => {
  const inputs = validInputs()
  const bundle = finalize(inputs)
  assert.equal(bundle.schema, 'elah.folia-baseline/v1')
  assert.equal(bundle.outcome, 'passed')
  assert.equal(bundle.clientEvidence.completedSessions, 32)
  assert.equal(bundle.worldIntegrity.unchanged, true)
  assert.doesNotThrow(() => verifyFoliaBaselineBundle({ bundle, ...inputs }))
})

test('rejects incomplete client stages and changed stopped-world evidence', () => {
  const incomplete = validInputs()
  incomplete.client.sessions[0].stages.pop()
  assert.throws(() => finalize(incomplete), /stage/i)

  const changed = validInputs()
  changed.after.rootSha256 = 'c'.repeat(64)
  assert.throws(() => finalize(changed), /changed/i)
})

test('rejects Observer semantic mismatches and artifact digest substitution', () => {
  const wrongObserver = validInputs()
  wrongObserver.deep.scan.content_nbt_decoded = false
  assert.throws(() => finalize(wrongObserver), /decoded/i)

  const inputs = validInputs()
  const bundle = finalize(inputs)
  bundle.clientEvidence.artifact.sha256 = '0'.repeat(64)
  assert.throws(() => verifyFoliaBaselineBundle({ bundle, ...inputs }), /digest/i)
})

test('emits a stable fail-closed error report with bounded public and technical detail', () => {
  const ledger = new FoliaBaselineLedger({ compatibility: FOLIA_BASELINE_COMPATIBILITY })
  const failure = new Error(`world changed\n${'x'.repeat(1000)}`)
  failure.kind = 'world_changed'
  const report = ledger.fail(failure, { phase: 'world_after', diagnosticRef: 'folia.log' })
  assert.equal(report.schema, 'elah.folia-baseline-error/v1')
  assert.equal(report.outcome, 'failed')
  assert.equal(report.error.kind, 'world_changed')
  assert.equal(report.error.summary.includes('\n'), false)
  assert.equal(report.error.summary.length <= 500, true)
  assert.equal(report.error.diagnosticRef, 'folia.log')
})
