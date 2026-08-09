// SPDX-FileCopyrightText: 2026 Greyfoundry contributors
// SPDX-License-Identifier: Apache-2.0 OR MIT

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkLicenseHeaders } from './check-license-headers.mjs';

async function withTrackedFiles(files, callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'elah-license-headers-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    for (const [relativePath, contents] of Object.entries(files)) {
      const absolutePath = path.join(root, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents);
    }
    execFileSync('git', ['add', '.'], { cwd: root });
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('rejects a human-authored comment-compatible file without SPDX notices', async () => {
  await withTrackedFiles(
    { 'src/example.mjs': 'export const value = 1;\n' },
    async (root) => {
      assert.deepEqual(await checkLicenseHeaders(root), [
        'src/example.mjs:1: expected SPDX-FileCopyrightText on the first syntactically valid line',
      ]);
    },
  );
});

test('rejects SPDX notices placed after executable source', async () => {
  await withTrackedFiles(
    {
      'src/example.mjs': "'use strict';\n// SPDX-FileCopyrightText: 2026 Greyfoundry contributors\n// SPDX-License-Identifier: Apache-2.0 OR MIT\n",
    },
    async (root) => {
      assert.deepEqual(await checkLicenseHeaders(root), [
        'src/example.mjs:1: expected SPDX-FileCopyrightText on the first syntactically valid line',
      ]);
    },
  );
});

test('rejects a top-position copyright notice without the license identifier', async () => {
  await withTrackedFiles(
    { 'src/example.mjs': '// SPDX-FileCopyrightText: 2026 Greyfoundry contributors\nexport const value = 1;\n' },
    async (root) => {
      assert.deepEqual(await checkLicenseHeaders(root), [
        'src/example.mjs:2: expected SPDX-License-Identifier immediately after SPDX-FileCopyrightText',
      ]);
    },
  );
});

test('accepts top-position SPDX notices in native comment syntax', async () => {
  await withTrackedFiles(
    {
      'src/example.mjs': '// SPDX-FileCopyrightText: 2026 Greyfoundry contributors\n// SPDX-License-Identifier: Apache-2.0 OR MIT\n\nexport const value = 1;\n',
      'config/example.yml': '# SPDX-FileCopyrightText: 2026 Greyfoundry contributors\n# SPDX-License-Identifier: Apache-2.0 OR MIT\n\nvalue: true\n',
    },
    async (root) => {
      assert.deepEqual(await checkLicenseHeaders(root), []);
    },
  );
});

test('leaves strict formats to precise REUSE annotations', async () => {
  await withTrackedFiles(
    {
      'config/example.json': '{"value":true}\n',
      'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
    },
    async (root) => {
      assert.deepEqual(await checkLicenseHeaders(root), []);
    },
  );
});
