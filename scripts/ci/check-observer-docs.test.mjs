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
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const operatorPath = 'docs/development/observer.md'
const adrPath = 'docs/adr/0007-read-only-observer.md'
const releasePath = 'docs/releases/0.0.3-observer.md'

test('Observer public documentation preserves its safety and evidence boundaries', async () => {
  const [readme, operator, adr, release] = await Promise.all([
    readFile('README.md', 'utf8'),
    readFile(operatorPath, 'utf8'),
    readFile(adrPath, 'utf8'),
    readFile(releasePath, 'utf8')
  ])
  requirePatterns('README.md', readme, [
    /0\.0\.3 \(Observer\)/,
    /elah observe <world>/,
    /read-only/i,
    /not a gameplay release/i
  ])
  requirePatterns(operatorPath, operator, [
    /elah observe <world>/,
    /--deep/,
    /--verbose/,
    /elah\.observe\/v1/,
    /fail(?:s|ed)? closed/i,
    /Java (?:Edition )?Anvil/i,
    /not proof of player activity/i,
    /16 MiB/,
    /64 MiB/,
    /128 MiB/,
    /1,000,000/,
    /exit 5/i,
    /filesystem snapshot/i
  ])
  requirePatterns(adrPath, adr, [
    /one Rust binary/i,
    /standard.*structural/i,
    /bounded deep/i,
    /Prismarine/i,
    /two-pass/i,
    /symlink/i,
    /no partial report/i,
    /write-capable/i
  ])
  requirePatterns(releasePath, release, [
    /Observer Laboratory \(standard, deep, immutable, fail-closed\)/,
    /not implement.*(?:Folia|Velocity|gameplay|ownership|storage|failover|repair|cluster)/is,
    /elah\.observer-laboratory\/v1/,
    /elah\.observer-comparison\/v1/
  ])
})

function requirePatterns (path, content, patterns) {
  for (const pattern of patterns) {
    assert.match(content, pattern, `${path} must match ${pattern}`)
  }
}
