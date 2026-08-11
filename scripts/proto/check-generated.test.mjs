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

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import * as generatedChecks from './check-generated.mjs';

const { verifyGeneratedOutput } = generatedChecks;

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

  assert.deepEqual(result, { inputs: 5, outputs: 30 });
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

test('clean regeneration rejects stale output when input and manifest hashes are updated together', async () => {
  await withTrackedGenerationFixture(async ({ root, manifest }) => {
    const [inputPath] = Object.keys(manifest.inputs);
    const [outputPath] = Object.keys(manifest.outputs);
    const changedInput = 'changed generation input';
    await writeFile(path.join(root, inputPath), changedInput);
    manifest.inputs[inputPath] = createHash('sha256').update(changedInput).digest('hex');
    await writeFile(
      path.join(root, manifestPath),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    await verifyGeneratedOutput({ root, manifestPath });

    await assert.rejects(
      generatedChecks.verifyRegeneratedOutput({
        root,
        generate: async ({ generationRoot }) => {
          for (const trackedOutputPath of Object.keys(manifest.outputs)) {
            const destination = path.join(generationRoot, trackedOutputPath);
            await mkdir(path.dirname(destination), { recursive: true });
            if (trackedOutputPath === outputPath) {
              await writeFile(destination, 'fresh output from changed input');
            } else {
              await copyFile(path.join(root, trackedOutputPath), destination);
            }
          }
        },
      }),
      new RegExp(`stale generated output: ${outputPath.replaceAll('\\', '\\\\')}`),
    );
  });
});

test('clean regeneration rejects an extra tracked output omitted from the manifest', async () => {
  await withTrackedGenerationFixture(async ({ root, manifest }) => {
    const extraOutputPath = path.join(
      'java/elah-api/src/generated/java',
      'org/greyfoundry/elah/control/v1/Unlisted.java',
    );
    await writeFile(path.join(root, extraOutputPath), 'unlisted generated output');

    await verifyGeneratedOutput({ root, manifestPath });

    await assert.rejects(
      generatedChecks.verifyRegeneratedOutput({
        root,
        generate: async ({ generationRoot }) => {
          for (const outputPath of Object.keys(manifest.outputs)) {
            const destination = path.join(generationRoot, outputPath);
            await mkdir(path.dirname(destination), { recursive: true });
            await copyFile(path.join(root, outputPath), destination);
          }
        },
      }),
      new RegExp(`unexpected tracked generated output: ${extraOutputPath.replaceAll('\\', '/').replaceAll('/', '\\/')}`),
    );
  });
});

test('clean regeneration rejects an unlisted TypeScript binding', async () => {
  await withTrackedGenerationFixture(async ({ root, manifest }) => {
    const extraOutputPath = path.join(
      'lab/protocol/generated',
      'control/v1/unlisted_pb.js',
    );
    await mkdir(path.dirname(path.join(root, extraOutputPath)), { recursive: true });
    await writeFile(path.join(root, extraOutputPath), 'unlisted generated output');

    await assert.rejects(
      generatedChecks.verifyRegeneratedOutput({
        root,
        generate: async ({ generationRoot }) => {
          for (const outputPath of Object.keys(manifest.outputs)) {
            const destination = path.join(generationRoot, outputPath);
            await mkdir(path.dirname(destination), { recursive: true });
            await copyFile(path.join(root, outputPath), destination);
          }
        },
      }),
      new RegExp(`unexpected tracked generated output: ${extraOutputPath.replaceAll('\\', '/').replaceAll('/', '\\/')}`),
    );
  });
});
