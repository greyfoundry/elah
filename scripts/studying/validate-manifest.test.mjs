// SPDX-FileCopyrightText: 2026 Greyfoundry contributors
// SPDX-License-Identifier: Apache-2.0 OR MIT

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
