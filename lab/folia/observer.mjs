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

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'

import { ClientLaboratoryError } from '../client/compatibility.mjs'

const executeFile = promisify(execFile)
const MAX_DIAGNOSTIC_CHARACTERS = 4000

export async function runObserver ({ executable, world, deep = false, execFileImpl = executeFile }) {
  validateBoundary(executable, world, deep, execFileImpl)
  const depth = deep ? 'deep' : 'standard'
  const args = ['observe', resolve(world), '--format', 'json', '--verbose', ...(deep ? ['--deep'] : [])]
  let result
  try {
    result = await execFileImpl(executable, args, {
      shell: false,
      windowsHide: true,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024
    })
  } catch (error) {
    const failure = new ClientLaboratoryError(
      'observer_process_failed',
      plainSummary(error, 'Observer process failed'),
      { cause: error }
    )
    failure.diagnostic = boundedDiagnostic(error?.stderr)
    throw failure
  }

  let report
  try {
    report = JSON.parse(result.stdout)
  } catch (error) {
    throw new ClientLaboratoryError('observer_invalid_json', 'Observer did not emit valid JSON', { cause: error })
  }
  assertObserverReport(report, depth)
  return { report, diagnostics: boundedDiagnostic(result.stderr) }
}

export function assertObserverReport (report, expectedDepth) {
  if (report?.schema !== 'elah.observe/v1') {
    throw new ClientLaboratoryError('observer_schema', 'Observer report schema is not elah.observe/v1')
  }
  if (report.scan?.depth !== expectedDepth) {
    throw new ClientLaboratoryError('observer_depth', `Observer report depth is not ${expectedDepth}`)
  }
  if (report.scan.consistent !== true) {
    throw new ClientLaboratoryError('observer_inconsistent', 'Observer report is not consistent')
  }
  const expectedDecode = expectedDepth === 'deep'
  if (report.scan.content_nbt_decoded !== expectedDecode) {
    throw new ClientLaboratoryError('observer_decode', `Observer ${expectedDepth} decoded-content evidence is invalid`)
  }
}

function validateBoundary (executable, world, deep, execFileImpl) {
  if (typeof executable !== 'string' || executable.trim() === '') {
    throw new ClientLaboratoryError('observer_executable', 'Observer executable is required')
  }
  if (typeof world !== 'string' || world.trim() === '') {
    throw new ClientLaboratoryError('observer_world', 'Observer world is required')
  }
  if (typeof deep !== 'boolean' || typeof execFileImpl !== 'function') {
    throw new ClientLaboratoryError('observer_boundary', 'Observer execution boundary is invalid')
  }
}

function plainSummary (error, fallback) {
  return (error instanceof Error ? error.message : String(error ?? fallback)).replace(/[\r\n]+/g, ' ').slice(0, 500)
}

function boundedDiagnostic (value) {
  return typeof value === 'string' ? value.slice(0, MAX_DIAGNOSTIC_CHARACTERS) : ''
}
