// SPDX-FileCopyrightText: 2026 Greyfoundry contributors
// SPDX-License-Identifier: Apache-2.0 OR MIT

import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { verifyGeneratedOutput } from './check-generated.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
const manifestPath = 'proto/generated-manifest.json';

async function withTrackedGenerationFixture(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'elah-proto-check-'));
  const manifest = JSON.parse(
    await readFile(path.join(repositoryRoot, manifestPath), 'utf8'),
  );
  const trackedPaths = [
    manifestPath,
    ...Object.keys(manifest.inputs),
    ...Object.keys(manifest.outputs),
  ];

  for (const relativePath of trackedPaths) {
    const destination = path.join(root, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(repositoryRoot, relativePath), destination);
  }

  try {
    await run({ root, manifest });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('tracked generated output matches its production manifest', async () => {
  const result = await verifyGeneratedOutput({ root: repositoryRoot, manifestPath });

  assert.deepEqual(result, { inputs: 3, outputs: 3 });
});

test('changing a tracked generation input is rejected', async () => {
  await withTrackedGenerationFixture(async ({ root, manifest }) => {
    const [inputPath] = Object.keys(manifest.inputs);
    await writeFile(path.join(root, inputPath), 'changed input');

    await assert.rejects(
      verifyGeneratedOutput({ root, manifestPath }),
      new RegExp(`stale generation input: ${inputPath.replaceAll('\\', '\\\\')}`),
    );
  });
});

test('deleting a tracked generation input is rejected', async () => {
  await withTrackedGenerationFixture(async ({ root, manifest }) => {
    const [inputPath] = Object.keys(manifest.inputs);
    await rm(path.join(root, inputPath));

    await assert.rejects(
      verifyGeneratedOutput({ root, manifestPath }),
      new RegExp(`missing generation input: ${inputPath.replaceAll('\\', '\\\\')}`),
    );
  });
});

test('changing a tracked generated output is rejected', async () => {
  await withTrackedGenerationFixture(async ({ root, manifest }) => {
    const [outputPath] = Object.keys(manifest.outputs);
    await writeFile(path.join(root, outputPath), 'changed output');

    await assert.rejects(
      verifyGeneratedOutput({ root, manifestPath }),
      new RegExp(`stale generated output: ${outputPath.replaceAll('\\', '\\\\')}`),
    );
  });
});

test('deleting a tracked generated output is rejected', async () => {
  await withTrackedGenerationFixture(async ({ root, manifest }) => {
    const [outputPath] = Object.keys(manifest.outputs);
    await rm(path.join(root, outputPath));

    await assert.rejects(
      verifyGeneratedOutput({ root, manifestPath }),
      new RegExp(`missing generated output: ${outputPath.replaceAll('\\', '\\\\')}`),
    );
  });
});
