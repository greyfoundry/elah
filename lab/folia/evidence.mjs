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

import { ClientLaboratoryError } from '../client/compatibility.mjs'
import { REQUIRED_STAGES } from '../client/ledger.mjs'
import { assertPinnedFoliaSource } from './compatibility.mjs'
import { assertObserverReport } from './observer.mjs'
import { assertWorldUnchanged } from './world-integrity.mjs'

export class FoliaBaselineLedger {
  #compatibility
  #artifact
  #environment
  #serverLifecycle
  #clientEvidence
  #observerEvidence
  #worldIntegrity
  #durations
  #failed = false

  constructor ({ compatibility }) {
    assertPinnedFoliaSource(compatibility)
    this.#compatibility = structuredClone(compatibility)
  }

  recordArtifact (artifact) {
    this.#ensureActive()
    ensureUnset(this.#artifact, 'Folia artifact')
    if (
      artifact?.file !== this.#compatibility.artifactFile ||
      artifact?.bytes !== this.#compatibility.artifactBytes ||
      artifact?.sha256 !== this.#compatibility.artifactSha256
    ) {
      fail('folia_artifact', 'Folia artifact does not match the pinned byte identity')
    }
    this.#artifact = structuredClone(artifact)
  }

  recordEnvironment (environment) {
    this.#ensureActive()
    ensureUnset(this.#environment, 'environment')
    if (
      !nonblank(environment?.os) ||
      !nonblank(environment?.arch) ||
      !nonblank(environment?.nodeVersion) ||
      !Number.isSafeInteger(environment?.javaMajor) ||
      environment.javaMajor < 1
    ) {
      fail('environment', 'Laboratory environment evidence is incomplete')
    }
    this.#environment = structuredClone(environment)
  }

  recordClient (report, artifact) {
    this.#ensureActive()
    ensureUnset(this.#clientEvidence, 'client evidence')
    assertClientReport(report, this.#compatibility)
    assertArtifactReference(artifact)
    assertReferenceMatches(artifact, report)
    this.#clientEvidence = {
      artifact: structuredClone(artifact),
      requestedWaves: report.requestedWaves,
      completedWaves: report.completedWaves,
      concurrency: report.concurrency,
      requestedSessions: report.requestedSessions,
      completedSessions: report.completedSessions,
      stageCounts: structuredClone(report.stageCounts)
    }
    this.#serverLifecycle = structuredClone(report.fixtureLifecycle)
  }

  recordObservers ({ standard, deep, standardRef, deepRef }) {
    this.#ensureActive()
    ensureUnset(this.#observerEvidence, 'Observer evidence')
    assertObserverReport(standard, 'standard')
    assertObserverReport(deep, 'deep')
    assertArtifactReference(standardRef)
    assertArtifactReference(deepRef)
    assertReferenceMatches(standardRef, standard)
    assertReferenceMatches(deepRef, deep)
    this.#observerEvidence = {
      standard: { artifact: structuredClone(standardRef), depth: 'standard', contentNbtDecoded: false },
      deep: { artifact: structuredClone(deepRef), depth: 'deep', contentNbtDecoded: true },
      consistent: true
    }
  }

  recordWorld ({ before, after, beforeRef, afterRef }) {
    this.#ensureActive()
    ensureUnset(this.#worldIntegrity, 'world integrity evidence')
    assertWorldSnapshot(before)
    assertWorldSnapshot(after)
    assertWorldUnchanged(before, after)
    assertArtifactReference(beforeRef)
    assertArtifactReference(afterRef)
    assertReferenceMatches(beforeRef, before)
    assertReferenceMatches(afterRef, after)
    this.#worldIntegrity = {
      before: worldSummary(before, beforeRef),
      after: worldSummary(after, afterRef),
      unchanged: true
    }
  }

  recordDurations (durations) {
    this.#ensureActive()
    ensureUnset(this.#durations, 'duration evidence')
    if (
      durations === null ||
      typeof durations !== 'object' ||
      Object.keys(durations).length === 0 ||
      Object.values(durations).some((value) => !Number.isSafeInteger(value) || value < 0)
    ) {
      fail('durations', 'Laboratory durations must be nonnegative safe integers')
    }
    this.#durations = structuredClone(durations)
  }

  fail (error, { phase, diagnosticRef } = {}) {
    this.#failed = true
    if (!nonblank(phase)) throw new ClientLaboratoryError('failure_phase', 'Failure phase is required')
    const kind = nonblank(error?.kind) ? error.kind : 'laboratory_failed'
    const rawSummary = error instanceof Error ? error.message : String(error)
    const detail = { kind, summary: rawSummary.replace(/[\r\n]+/g, ' ').slice(0, 500), phase }
    if (diagnosticRef !== undefined) {
      if (!nonblank(diagnosticRef)) throw new ClientLaboratoryError('diagnostic_reference', 'Diagnostic reference is invalid')
      detail.diagnosticRef = diagnosticRef
    }
    return { schema: 'elah.folia-baseline-error/v1', outcome: 'failed', error: detail }
  }

  finalize () {
    this.#ensureActive()
    if (
      !this.#artifact ||
      !this.#environment ||
      !this.#serverLifecycle ||
      !this.#clientEvidence ||
      !this.#observerEvidence ||
      !this.#worldIntegrity ||
      !this.#durations
    ) {
      fail('incomplete_folia_baseline', 'Folia baseline cannot finalize before all required evidence is complete')
    }
    return {
      schema: 'elah.folia-baseline/v1',
      outcome: 'passed',
      compatibility: structuredClone(this.#compatibility),
      environment: structuredClone(this.#environment),
      artifact: structuredClone(this.#artifact),
      serverLifecycle: structuredClone(this.#serverLifecycle),
      clientEvidence: structuredClone(this.#clientEvidence),
      observerEvidence: structuredClone(this.#observerEvidence),
      worldIntegrity: structuredClone(this.#worldIntegrity),
      durations: structuredClone(this.#durations)
    }
  }

  #ensureActive () {
    if (this.#failed) fail('folia_baseline_failed', 'Folia baseline ledger is already failed')
  }
}

export function serializeJsonArtifact (value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function artifactReference (path, value) {
  if (!nonblank(path)) fail('artifact_reference', 'Artifact path is required')
  const bytes = Buffer.from(serializeJsonArtifact(value), 'utf8')
  return {
    path,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex')
  }
}

export function verifyFoliaBaselineBundle ({ bundle, client, standard, deep, before, after }) {
  if (bundle?.schema !== 'elah.folia-baseline/v1' || bundle.outcome !== 'passed') {
    fail('bundle_schema', 'Folia baseline bundle is not a passing elah.folia-baseline/v1 report')
  }
  assertPinnedFoliaSource(bundle.compatibility)
  assertClientReport(client, bundle.compatibility)
  assertObserverReport(standard, 'standard')
  assertObserverReport(deep, 'deep')
  assertWorldSnapshot(before)
  assertWorldSnapshot(after)
  assertWorldUnchanged(before, after)
  assertReferenceMatches(bundle.clientEvidence?.artifact, client)
  assertReferenceMatches(bundle.observerEvidence?.standard?.artifact, standard)
  assertReferenceMatches(bundle.observerEvidence?.deep?.artifact, deep)
  assertReferenceMatches(bundle.worldIntegrity?.before?.artifact, before)
  assertReferenceMatches(bundle.worldIntegrity?.after?.artifact, after)
  if (
    bundle.serverLifecycle?.readyObserved !== true ||
    bundle.serverLifecycle?.cleanStopRequested !== true ||
    bundle.serverLifecycle?.exitCode !== 0 ||
    bundle.serverLifecycle?.signal !== null ||
    bundle.worldIntegrity?.unchanged !== true ||
    bundle.worldIntegrity.before?.rootSha256 !== before.rootSha256 ||
    bundle.worldIntegrity.after?.rootSha256 !== after.rootSha256
  ) {
    fail('bundle_evidence', 'Folia baseline bundle summary does not match its evidence')
  }
}

function assertClientReport (report, compatibility) {
  if (report?.schema !== 'elah.client-laboratory/v1' || report.outcome !== 'passed') {
    fail('client_evidence', 'Folia client evidence is not passing')
  }
  assertPinnedFoliaSource(report.compatibility)
  const expectedSessions = compatibility.waves * compatibility.concurrency
  if (
    report.requestedWaves !== compatibility.waves ||
    report.completedWaves !== compatibility.waves ||
    report.concurrency !== compatibility.concurrency ||
    report.requestedSessions !== expectedSessions ||
    report.completedSessions !== expectedSessions ||
    report.sessions?.length !== expectedSessions ||
    report.serverCleanup?.requested !== true ||
    report.serverCleanup?.exitCode !== 0 ||
    report.fixtureLifecycle?.readyObserved !== true ||
    report.fixtureLifecycle?.cleanStopRequested !== true ||
    report.fixtureLifecycle?.exitCode !== 0 ||
    report.fixtureLifecycle?.signal !== null
  ) {
    fail('client_evidence', 'Folia client evidence counts or server lifecycle are incomplete')
  }
  const sessionIds = new Set()
  const usernames = new Set()
  const waveCounts = new Map()
  for (const session of report.sessions) {
    if (!nonblank(session?.sessionId) || !nonblank(session?.username)) fail('client_identity', 'Folia session identity is invalid')
    sessionIds.add(session.sessionId)
    usernames.add(session.username)
    waveCounts.set(session.wave, (waveCounts.get(session.wave) ?? 0) + 1)
    const stages = session.stages?.map(({ name }) => name)
    if (JSON.stringify(stages) !== JSON.stringify(REQUIRED_STAGES)) {
      fail('client_stage', `Folia session ${session.sessionId} stage evidence is incomplete`)
    }
  }
  if (
    sessionIds.size !== expectedSessions ||
    usernames.size !== expectedSessions ||
    Array.from({ length: compatibility.waves }, (_, index) => waveCounts.get(index + 1))
      .some((count) => count !== compatibility.concurrency) ||
    REQUIRED_STAGES.some((stage) => report.stageCounts?.[stage] !== expectedSessions)
  ) {
    fail('client_evidence', 'Folia session identities, waves, or stage counts are incomplete')
  }
}

function assertWorldSnapshot (snapshot) {
  if (
    snapshot?.schema !== 'elah.world-tree/v1' ||
    !hexDigest(snapshot.rootSha256) ||
    !Number.isSafeInteger(snapshot.regularFileCount) ||
    snapshot.regularFileCount < 0 ||
    !Number.isSafeInteger(snapshot.regularBytes) ||
    snapshot.regularBytes < 0 ||
    snapshot.files?.length !== snapshot.regularFileCount
  ) {
    fail('world_snapshot', 'World integrity snapshot is invalid')
  }
  let bytes = 0
  let previousPath
  for (const file of snapshot.files) {
    if (
      !nonblank(file?.path) ||
      !Number.isSafeInteger(file?.bytes) ||
      file.bytes < 0 ||
      !hexDigest(file?.sha256) ||
      (previousPath !== undefined && Buffer.from(previousPath).compare(Buffer.from(file.path)) >= 0)
    ) {
      fail('world_snapshot', 'World integrity file evidence is invalid')
    }
    previousPath = file.path
    bytes += file.bytes
  }
  if (bytes !== snapshot.regularBytes) fail('world_snapshot', 'World integrity byte count is invalid')
}

function worldSummary (snapshot, artifact) {
  return {
    artifact: structuredClone(artifact),
    rootSha256: snapshot.rootSha256,
    regularFileCount: snapshot.regularFileCount,
    regularBytes: snapshot.regularBytes
  }
}

function assertArtifactReference (reference) {
  if (!nonblank(reference?.path) || !Number.isSafeInteger(reference?.bytes) || reference.bytes < 1 || !hexDigest(reference?.sha256)) {
    fail('artifact_reference', 'Evidence artifact reference is invalid')
  }
}

function assertReferenceMatches (reference, value) {
  assertArtifactReference(reference)
  const expected = artifactReference(reference.path, value)
  if (reference.bytes !== expected.bytes || reference.sha256 !== expected.sha256) {
    fail('artifact_digest', `Evidence artifact digest does not match ${reference.path}`)
  }
}

function ensureUnset (value, name) {
  if (value !== undefined) fail('duplicate_evidence', `${name} was already recorded`)
}

function hexDigest (value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function nonblank (value) {
  return typeof value === 'string' && value.trim() !== ''
}

function fail (kind, summary) {
  throw new ClientLaboratoryError(kind, summary)
}
