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
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkLicenseHeaders } from './check-license-headers.mjs';

const noticeLines = [
  `╔${'═'.repeat(66)}╗`,
  `║${''.padStart(66)}║`,
  `║${'ELAH | A GREYFOUNDRY PROJECT'.padStart(47).padEnd(66)}║`,
  `║${''.padStart(66)}║`,
  `║${'https://github.com/greyfoundry/elah'.padStart(50).padEnd(66)}║`,
  `║${''.padStart(66)}║`,
  `╚${'═'.repeat(66)}╝`,
  '',
  'Copyright © 2026 Greyfoundry contributors.',
  'SPDX-FileCopyrightText: 2026 Greyfoundry contributors',
  '',
  'Licensed under the Apache License, Version 2.0 (the "License");',
  'you may not use this file except in compliance with the License.',
  'You may obtain a copy of the License at',
  '',
  '     https://www.apache.org/licenses/LICENSE-2.0',
  '',
  'Unless required by applicable law or agreed to in writing, software',
  'distributed under the License is distributed on an "AS IS" BASIS,',
  'WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.',
  'See the License for the specific language governing permissions and',
  'limitations under the License.',
  '',
  ['SPDX-License', 'Identifier: Apache-2.0'].join('-'),
  '',
];

function notice(open, close) {
  return `${noticeLines.map((line) => {
    if (close) return line ? `${open} ${line} ${close}` : `${open} ${close}`;
    return line ? `${open} ${line}` : open;
  }).join('\n')}\n`;
}

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

const missingDiagnostic = (file, line = 1) =>
  `${file}:${line}: expected the complete Greyfoundry Apache-2.0 notice at the first syntactically valid line`;

test('rejects a comment-compatible file without the complete notice', async () => {
  await withTrackedFiles({ 'src/example.mjs': 'export const value = 1;\n' }, async (root) => {
    assert.deepEqual(await checkLicenseHeaders(root), [missingDiagnostic('src/example.mjs')]);
  });
});

test('rejects the former two-line SPDX-only header', async () => {
  await withTrackedFiles({
    'src/example.mjs': `// SPDX-FileCopyrightText: 2026 Greyfoundry contributors\n// ${['SPDX-License', 'Identifier: Apache-2.0'].join('-')}\n`,
  }, async (root) => {
    assert.deepEqual(await checkLicenseHeaders(root), [missingDiagnostic('src/example.mjs')]);
  });
});

test('rejects a complete notice placed after executable source', async () => {
  await withTrackedFiles({
    'src/example.mjs': `'use strict';\n${notice('//')}export const value = 1;\n`,
  }, async (root) => {
    assert.deepEqual(await checkLicenseHeaders(root), [missingDiagnostic('src/example.mjs')]);
  });
});

test('accepts complete notices in every supported comment syntax', async () => {
  await withTrackedFiles({
    'src/example.mjs': `${notice('//')}export const value = 1;\n`,
    'config/example.yml': `${notice('#')}value: true\n`,
    '.github/CODEOWNERS': `${notice('#')}* @greyfoundry/elah-maintainers\n`,
    'db/schema.sql': `${notice('--')}SELECT 1;\n`,
    'web/example.css': `${notice('/*', '*/')}body {}\n`,
    'web/example.html': `${notice('<!--', '-->')}<p>Example</p>\n`,
    'scripts/example.cmd': `${notice('REM')}@echo off\n`,
  }, async (root) => {
    assert.deepEqual(await checkLicenseHeaders(root), []);
  });
});

test('rejects the legacy project banner', async () => {
  const legacyBannerText = ['ELAH', 'A GREYFOUNDRY PROJECT'].join(` ${String.fromCodePoint(0x2014)} `);
  const legacyBanner = `║${legacyBannerText.padStart(47).padEnd(66)}║`;
  const legacyNotice = notice('//').replace(`// ${noticeLines[2]}`, `// ${legacyBanner}`);
  await withTrackedFiles({
    'src/example.mjs': `${legacyNotice}export const value = 1;\n`,
  }, async (root) => {
    assert.deepEqual(await checkLicenseHeaders(root), [missingDiagnostic('src/example.mjs')]);
  });
});

test('accepts a shebang immediately followed by the complete notice', async () => {
  await withTrackedFiles({
    'scripts/example.sh': `#!/bin/sh\n${notice('#')}echo ok\n`,
  }, async (root) => {
    assert.deepEqual(await checkLicenseHeaders(root), []);
  });
});

test('accepts an XML declaration immediately followed by the complete notice', async () => {
  await withTrackedFiles({
    'config/example.xml': `<?xml version="1.0" encoding="UTF-8"?>\n${notice('<!--', '-->')}<example />\n`,
  }, async (root) => {
    assert.deepEqual(await checkLicenseHeaders(root), []);
  });
});

test('rejects comments placed before an XML declaration', async () => {
  await withTrackedFiles({
    'config/example.xml': `${notice('<!--', '-->')}<?xml version="1.0" encoding="UTF-8"?>\n<example />\n`,
  }, async (root) => {
    assert.deepEqual(await checkLicenseHeaders(root), [
      `config/example.xml:${noticeLines.length + 1}: XML declaration must be the first syntactically valid line`,
    ]);
  });
});

test('rejects an unclassified tracked file instead of silently skipping it', async () => {
  await withTrackedFiles({ 'src/policy.future': 'human-authored content\n' }, async (root) => {
    assert.deepEqual(await checkLicenseHeaders(root), [
      'src/policy.future: unsupported file type; add native SPDX syntax or an explicit scanner classification',
    ]);
  });
});

test('leaves strict, generated, documentation, and upstream wrapper files to REUSE', async () => {
  await withTrackedFiles({
    'config/example.json': '{"value":true}\n',
    '.node-version': '24.19.0\n',
    'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
    'docs/example.md': '# Documentation\n',
    'java/elah-api/src/generated/java/Generated.java': 'generated\n',
    'lab/protocol/generated/control/v1/protocol_pb.js': 'generated\n',
    'lab/protocol/generated/control/v1/protocol_pb.d.ts': 'generated\n',
    gradlew: '#!/bin/sh\n',
    'gradlew.bat': '@echo off\n',
  }, async (root) => {
    assert.deepEqual(await checkLicenseHeaders(root), []);
  });
});
