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
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { createFixture } from './create-fixture.mjs'
import { inventoryFiles } from './fixture-hash.mjs'
import { verifyReports } from './verify-report.mjs'

const execFileAsync = promisify(execFile)

export async function runLaboratory ({
  elahPath = defaultElahPath(),
  outputDirectory = resolve('build/reports/observer-laboratory'),
  small = false
} = {}) {
  const reportPath = join(outputDirectory, 'report.json')
  const comparisonPath = join(outputDirectory, 'comparison.json')
  await mkdir(outputDirectory, { recursive: true })
  await Promise.all([
    rm(reportPath, { force: true }),
    rm(comparisonPath, { force: true })
  ])
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'elah-observer-laboratory-'))
  try {
    const truth = await createFixture(fixtureRoot, { small })
    const before = await inventoryFiles(fixtureRoot)
    const standardRun = await runElah(elahPath, fixtureRoot, false)
    const deepRun = await runElah(elahPath, fixtureRoot, true)
    const comparison = verifyReports(truth, standardRun.report, deepRun.report)
    const after = await inventoryFiles(fixtureRoot)
    assert.deepEqual(after, before, 'Observer changed fixture bytes')
    const changedWorld = await runChangedWorldHarness()
    const completeComparison = {
      ...comparison,
      completeInventoryUnchanged: true,
      changedWorld
    }
    const report = {
      schema: 'elah.observer-laboratory/v1',
      truth,
      inventoryBefore: before,
      inventoryAfter: after,
      standard: standardRun.report,
      deep: deepRun.report,
      notices: {
        standard: standardRun.stderr,
        deep: deepRun.stderr
      },
      comparison: completeComparison
    }
    await writeJsonAtomic(comparisonPath, completeComparison)
    await writeJsonAtomic(reportPath, report)
    return { report, comparison: completeComparison, reportPath, comparisonPath }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
}

async function runElah (elahPath, fixtureRoot, deep) {
  const elahArguments = ['observe', fixtureRoot, '--format', 'json', '--verbose']
  if (deep) elahArguments.push('--deep')
  const { stdout, stderr } = await execFileAsync(elahPath, elahArguments, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true
  })
  const report = JSON.parse(stdout)
  if (report.schema !== 'elah.observe/v1') {
    throw new Error(`elah emitted unexpected schema ${String(report.schema)}`)
  }
  return { report, stderr }
}

async function runChangedWorldHarness () {
  const { stdout, stderr } = await execFileAsync(
    'cargo',
    [
      '+1.97.1',
      'test',
      '-p',
      'elah-cli',
      '--test',
      'cli',
      'changed_world_returns_five_without_a_partial_report',
      '--',
      '--exact'
    ],
    {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true
    }
  )
  if (!stdout.includes('1 passed') && !stderr.includes('1 passed')) {
    throw new Error('changed-world CLI harness did not prove its exact assertion')
  }
  return {
    passed: true,
    expectedExit: 5,
    expectedSuccessReportBytes: 0,
    test: 'changed_world_returns_five_without_a_partial_report'
  }
}

async function writeJsonAtomic (path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${process.pid}`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  await rename(temporary, path)
}

function defaultElahPath () {
  return resolve('target', 'debug', process.platform === 'win32' ? 'elah.exe' : 'elah')
}

function parseArguments (arguments_) {
  let small = false
  let elahPath = defaultElahPath()
  let outputDirectory = resolve('build/reports/observer-laboratory')
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === '--small') {
      small = true
    } else if (argument === '--elah') {
      elahPath = resolve(requireValue(arguments_, ++index, '--elah'))
    } else if (argument === '--output') {
      outputDirectory = resolve(requireValue(arguments_, ++index, '--output'))
    } else {
      throw new Error(`unknown Observer Laboratory argument: ${argument}`)
    }
  }
  return { small, elahPath, outputDirectory }
}

function requireValue (arguments_, index, option) {
  if (index >= arguments_.length) throw new Error(`${option} requires a value`)
  return arguments_[index]
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    const result = await runLaboratory(parseArguments(process.argv.slice(2)))
    console.log(`Observer Laboratory passed: ${result.reportPath}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
