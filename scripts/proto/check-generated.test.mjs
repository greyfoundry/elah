// SPDX-FileCopyrightText: 2026 Greyfoundry contributors
// SPDX-License-Identifier: Apache-2.0 OR MIT

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { verifyGeneratedOutput } from './check-generated.mjs';

const schemaDigest = '3d54d3b6376b8f6a85ca302411a588a9632b21fbb1e8898c8c3fb2481eeec7a8';
const generatedDigest = '5bd0840d179bcfd08e55b6e1b8bcb602fb0be6323d595653a949cef48c94ae98';

async function withFixture(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'elah-proto-check-'));
  await mkdir(path.join(root, 'proto'), { recursive: true });
  await mkdir(path.join(root, 'generated'), { recursive: true });
  await writeFile(path.join(root, 'proto', 'identity.proto'), 'schema-v1');
  await writeFile(
    path.join(root, 'generated-manifest.json'),
    JSON.stringify({
      version: 1,
      inputs: { 'proto/identity.proto': schemaDigest },
      outputs: { 'generated/identity.txt': generatedDigest },
    }),
  );

  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('generated-output verification rejects a missing output', async () => {
  await withFixture(async (root) => {
    await assert.rejects(
      verifyGeneratedOutput({ root, manifestPath: 'generated-manifest.json' }),
      /missing generated output.*generated\/identity\.txt/i,
    );
  });
});

test('generated-output verification rejects stale output', async () => {
  await withFixture(async (root) => {
    await writeFile(path.join(root, 'generated', 'identity.txt'), 'stale-output');

    await assert.rejects(
      verifyGeneratedOutput({ root, manifestPath: 'generated-manifest.json' }),
      /stale generated output.*generated\/identity\.txt/i,
    );
  });
});

test('generated-output verification accepts content matching its manifest', async () => {
  await withFixture(async (root) => {
    await writeFile(path.join(root, 'generated', 'identity.txt'), 'generated-v1');

    const result = await verifyGeneratedOutput({ root, manifestPath: 'generated-manifest.json' });

    assert.deepEqual(result, { inputs: 1, outputs: 1 });
  });
});
