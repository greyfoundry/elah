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

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const generatedRoots = [
  'java/elah-api/src/generated/java',
  'lab/protocol/generated',
];

function resolveWithin(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  const relation = path.relative(resolvedRoot, resolvedPath);
  if (relation.startsWith('..') || path.isAbsolute(relation)) {
    throw new Error(`generation manifest path escapes its root: ${relativePath}`);
  }
  return resolvedPath;
}

async function digestFile(filePath, kind, relativePath) {
  let content;
  try {
    content = await readFile(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`missing ${kind}: ${relativePath}`);
    }
    throw error;
  }
  return createHash('sha256').update(content).digest('hex');
}

async function verifyEntries(root, entries, kind) {
  for (const [relativePath, expectedDigest] of Object.entries(entries)) {
    const actualDigest = await digestFile(
      resolveWithin(root, relativePath),
      kind,
      relativePath,
    );
    if (actualDigest !== expectedDigest) {
      throw new Error(`stale ${kind}: ${relativePath}`);
    }
  }
}

export async function verifyGeneratedOutput({ root, manifestPath }) {
  const manifestFile = resolveWithin(root, manifestPath);
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  if (
    manifest.version !== 1 ||
    manifest.inputs === null ||
    typeof manifest.inputs !== 'object' ||
    manifest.outputs === null ||
    typeof manifest.outputs !== 'object'
  ) {
    throw new Error('invalid generated-output manifest');
  }

  await verifyEntries(root, manifest.inputs, 'generation input');
  await verifyEntries(root, manifest.outputs, 'generated output');

  return {
    inputs: Object.keys(manifest.inputs).length,
    outputs: Object.keys(manifest.outputs).length,
  };
}

async function listFiles(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile()) {
        files.push(path.relative(root, entryPath).replaceAll('\\', '/'));
      }
    }
  }
  try {
    await visit(root);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
  return files.sort();
}

async function runBufGeneration({ root, generationRoot }) {
  await execFileAsync(
    'buf',
    [
      'generate',
      'proto',
      '--template',
      path.join(root, 'proto/buf.gen.yaml'),
      '--output',
      generationRoot,
    ],
    { cwd: root, maxBuffer: 16 * 1024 * 1024 },
  );
}

export async function verifyRegeneratedOutput({ root, generate = runBufGeneration }) {
  const generationRoot = await mkdtemp(path.join(tmpdir(), 'elah-proto-generation-'));
  try {
    await generate({ root, generationRoot });
    let outputCount = 0;
    for (const generatedRoot of generatedRoots) {
      const checkedInRoot = resolveWithin(root, generatedRoot);
      const regeneratedRoot = resolveWithin(generationRoot, generatedRoot);
      const checkedInFiles = await listFiles(checkedInRoot);
      const regeneratedFiles = await listFiles(regeneratedRoot);
      const regeneratedSet = new Set(regeneratedFiles);

      for (const relativePath of checkedInFiles) {
        if (!regeneratedSet.has(relativePath)) {
          throw new Error(`unexpected tracked generated output: ${path.posix.join(generatedRoot, relativePath)}`);
        }
      }
      const checkedInSet = new Set(checkedInFiles);
      for (const relativePath of regeneratedFiles) {
        const repositoryPath = path.posix.join(generatedRoot, relativePath);
        if (!checkedInSet.has(relativePath)) {
          throw new Error(`missing generated output: ${repositoryPath}`);
        }
        const [checkedIn, regenerated] = await Promise.all([
          readFile(path.join(checkedInRoot, relativePath)),
          readFile(path.join(regeneratedRoot, relativePath)),
        ]);
        if (!checkedIn.equals(regenerated)) {
          throw new Error(`stale generated output: ${repositoryPath}`);
        }
      }
      outputCount += regeneratedFiles.length;
    }

    return { outputs: outputCount };
  } finally {
    await rm(generationRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error('usage: node scripts/proto/check-generated.mjs <manifest> [root]');
    process.exitCode = 2;
  } else {
    const root = process.argv[3] ?? process.cwd();
    Promise.all([
      verifyGeneratedOutput({ root, manifestPath }),
      verifyRegeneratedOutput({ root }),
    ])
      .then(([{ inputs, outputs }]) => {
        console.log(`generated output is current after clean regeneration (${inputs} inputs, ${outputs} outputs)`);
      })
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
  }
}
