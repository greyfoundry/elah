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

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { validateManifest } from './validate-manifest.mjs';

const manifestPath = path.resolve('studying/manifest.lock');
const trackedManifest = JSON.parse(await readFile(manifestPath, 'utf8'));

function copiedManifest() {
  return structuredClone(trackedManifest);
}

test('accepts the tracked study manifest', () => {
  assert.deepEqual(validateManifest(trackedManifest), []);
});

test('rejects an upstream pin with a malformed commit SHA', () => {
  const manifest = copiedManifest();
  manifest.repositories[0].sha = 'not-a-commit';

  assert.match(validateManifest(manifest).join('\n'), /40-character lowercase hexadecimal SHA/);
});

test('rejects an upstream entry without an SPDX identifier', () => {
  const manifest = copiedManifest();
  delete manifest.repositories[0].spdx;

  assert.match(validateManifest(manifest).join('\n'), /SPDX license identifier/);
});

test('rejects duplicate repository names', () => {
  const manifest = copiedManifest();
  manifest.repositories[1].repo = 'PaperMC/Folia';

  assert.match(validateManifest(manifest).join('\n'), /duplicate repository name/);
});

test('rejects duplicate repository names that differ only by case', () => {
  const manifest = copiedManifest();
  manifest.repositories[1].repo = 'papermc/folia';
  manifest.repositories[1].url = 'https://github.com/papermc/folia';

  assert.match(validateManifest(manifest).join('\n'), /duplicate repository name/);
});

test('rejects a repository URL that does not match its normalized repository name', () => {
  const manifest = copiedManifest();
  manifest.repositories[0].url = 'https://github.com/PaperMC/Velocity';

  assert.match(validateManifest(manifest).join('\n'), /must match repo/);
});

test('rejects an upstream entry without a study purpose', () => {
  const manifest = copiedManifest();
  manifest.repositories[0].purpose = '  ';

  assert.match(validateManifest(manifest).join('\n'), /purpose/);
});

test('rejects an upstream entry without ADR references array', () => {
  const manifest = copiedManifest();
  delete manifest.repositories[0].adrs;

  assert.match(validateManifest(manifest).join('\n'), /ADRs array/);
});

test('rejects an upstream pin without its own retrieval date', () => {
  const manifest = copiedManifest();
  delete manifest.repositories[0].retrievedAt;

  assert.match(validateManifest(manifest).join('\n'), /retrievedAt/);
});

test('rejects a retrieval date that is not a real ISO calendar date', () => {
  const manifest = copiedManifest();
  manifest.retrievedAt = '2026-02-31';

  assert.match(validateManifest(manifest).join('\n'), /ISO-8601 date/);
});

test('rejects NOASSERTION without an explicit license note', () => {
  const manifest = copiedManifest();
  delete manifest.repositories[3].licenseNote;

  assert.match(validateManifest(manifest).join('\n'), /license note/);
});
