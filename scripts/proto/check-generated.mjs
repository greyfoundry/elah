// SPDX-FileCopyrightText: 2026 Greyfoundry contributors
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error('usage: node scripts/proto/check-generated.mjs <manifest> [root]');
    process.exitCode = 2;
  } else {
    verifyGeneratedOutput({ root: process.argv[3] ?? process.cwd(), manifestPath })
      .then(({ inputs, outputs }) => {
        console.log(`generated output is current (${inputs} inputs, ${outputs} outputs)`);
      })
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
  }
}
