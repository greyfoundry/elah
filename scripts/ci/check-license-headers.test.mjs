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
      'db/schema.sql': '-- SPDX-FileCopyrightText: 2026 Greyfoundry contributors\n-- SPDX-License-Identifier: Apache-2.0 OR MIT\n\nSELECT 1;\n',
      'web/example.css': '/* SPDX-FileCopyrightText: 2026 Greyfoundry contributors */\n/* SPDX-License-Identifier: Apache-2.0 OR MIT */\n\nbody {}\n',
      'web/example.html': '<!-- SPDX-FileCopyrightText: 2026 Greyfoundry contributors -->\n<!-- SPDX-License-Identifier: Apache-2.0 OR MIT -->\n\n<p>Example</p>\n',
      'config/example.xml': '<!-- SPDX-FileCopyrightText: 2026 Greyfoundry contributors -->\n<!-- SPDX-License-Identifier: Apache-2.0 OR MIT -->\n\n<example />\n',
    },
    async (root) => {
      assert.deepEqual(await checkLicenseHeaders(root), []);
    },
  );
});

test('rejects missing SPDX notices in additional comment-compatible formats', async () => {
  await withTrackedFiles(
    {
      'db/schema.sql': 'SELECT 1;\n',
      'web/example.css': 'body {}\n',
      'web/example.html': '<p>Example</p>\n',
      'config/example.xml': '<example />\n',
    },
    async (root) => {
      assert.deepEqual(await checkLicenseHeaders(root), [
        'config/example.xml:1: expected SPDX-FileCopyrightText on the first syntactically valid line',
        'db/schema.sql:1: expected SPDX-FileCopyrightText on the first syntactically valid line',
        'web/example.css:1: expected SPDX-FileCopyrightText on the first syntactically valid line',
        'web/example.html:1: expected SPDX-FileCopyrightText on the first syntactically valid line',
      ]);
    },
  );
});

test('rejects an unclassified tracked file instead of silently skipping it', async () => {
  await withTrackedFiles(
    { 'src/policy.future': 'human-authored content\n' },
    async (root) => {
      assert.deepEqual(await checkLicenseHeaders(root), [
        'src/policy.future: unsupported file type; add native SPDX syntax or an explicit scanner classification',
      ]);
    },
  );
});

test('accepts an XML declaration immediately followed by SPDX comments', async () => {
  await withTrackedFiles(
    {
      'config/example.xml': '<?xml version="1.0" encoding="UTF-8"?>\n<!-- SPDX-FileCopyrightText: 2026 Greyfoundry contributors -->\n<!-- SPDX-License-Identifier: Apache-2.0 OR MIT -->\n<example />\n',
    },
    async (root) => {
      assert.deepEqual(await checkLicenseHeaders(root), []);
    },
  );
});

test('rejects SPDX comments placed before an XML declaration', async () => {
  await withTrackedFiles(
    {
      'config/example.xml': '<!-- SPDX-FileCopyrightText: 2026 Greyfoundry contributors -->\n<!-- SPDX-License-Identifier: Apache-2.0 OR MIT -->\n<?xml version="1.0" encoding="UTF-8"?>\n<example />\n',
    },
    async (root) => {
      assert.deepEqual(await checkLicenseHeaders(root), [
        'config/example.xml:3: XML declaration must be the first syntactically valid line',
      ]);
    },
  );
});

test('leaves strict formats to precise REUSE annotations', async () => {
  await withTrackedFiles(
    {
      'config/example.json': '{"value":true}\n',
      '.node-version': '24.19.0\n',
      'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
    },
    async (root) => {
      assert.deepEqual(await checkLicenseHeaders(root), []);
    },
  );
});
