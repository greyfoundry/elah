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

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const excludedFiles = new Set([
  '.node-version',
  'gradle/wrapper/gradle-wrapper.jar',
  'gradlew',
  'gradlew.bat',
  'LICENSE',
  'pnpm-lock.yaml',
]);
const slashCommentExtensions = new Set(['.cjs', '.gradle', '.java', '.js', '.jsx', '.kt', '.kts', '.mjs', '.proto', '.rs', '.ts', '.tsx']);
const hashCommentExtensions = new Set(['.bash', '.properties', '.ps1', '.py', '.rb', '.sh', '.toml', '.yaml', '.yml']);
const binaryExtensions = new Set(['.class', '.dll', '.exe', '.ico', '.jar', '.jpeg', '.jpg', '.nbt', '.pb', '.png', '.wasm', '.zip']);
const strictExtensions = new Set(['.json', '.lock']);

async function trackedFiles(root) {
  const { stdout } = await execFileAsync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((file) => file.replaceAll('\\', '/'))
    .sort();
}

function commentPrefix(file) {
  const basename = path.posix.basename(file);
  if (['.gitattributes', '.gitignore', 'CODEOWNERS', 'Dockerfile', 'Justfile', 'Makefile', 'justfile'].includes(basename)) {
    return { open: '#' };
  }
  const extension = path.posix.extname(file).toLowerCase();
  if (slashCommentExtensions.has(extension)) {
    return { open: '//' };
  }
  if (hashCommentExtensions.has(extension)) {
    return { open: '#' };
  }
  if (extension === '.bat' || extension === '.cmd') {
    return { open: 'REM' };
  }
  if (extension === '.sql') {
    return { open: '--' };
  }
  if (extension === '.css') {
    return { open: '/*', close: '*/' };
  }
  if (extension === '.html' || extension === '.xml') {
    return { open: '<!--', close: '-->' };
  }
  return undefined;
}

function isExcluded(file) {
  const extension = path.posix.extname(file).toLowerCase();
  return (
    excludedFiles.has(file) ||
    binaryExtensions.has(extension) ||
    strictExtensions.has(extension) ||
    file.startsWith('java/elah-api/src/generated/java/') ||
    file.startsWith('lab/protocol/generated/') ||
    file.startsWith('LICENSES/') ||
    file.endsWith('.md')
  );
}

const apacheNoticeLines = [
  `╔${'═'.repeat(66)}╗`,
  `║${''.padStart(66)}║`,
  `║${'ELAH — A GREYFOUNDRY PROJECT'.padStart(47).padEnd(66)}║`,
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

const asciiApacheNoticeLines = apacheNoticeLines.with(
  2,
  `║${'ELAH | A GREYFOUNDRY PROJECT'.padStart(47).padEnd(66)}║`,
);

function expectedHeader(syntax, noticeLines) {
  return noticeLines.map((line) => {
    if (syntax.close) {
      return line ? `${syntax.open} ${line} ${syntax.close}` : `${syntax.open} ${syntax.close}`;
    }
    return line ? `${syntax.open} ${line}` : syntax.open;
  });
}

export async function checkLicenseHeaders(root = process.cwd()) {
  const diagnostics = [];
  for (const file of await trackedFiles(root)) {
    if (isExcluded(file)) {
      continue;
    }
    const syntax = commentPrefix(file);
    if (!syntax) {
      diagnostics.push(
        `${file}: unsupported file type; add native SPDX syntax or an explicit scanner classification`,
      );
      continue;
    }

    const contents = (await readFile(path.join(root, file), 'utf8')).replace(/^\uFEFF/, '');
    const lines = contents.split(/\r?\n/);
    const extension = path.posix.extname(file).toLowerCase();
    const xmlDeclaration = extension === '.xml'
      ? lines.findIndex((line) => /^<\?xml(?:\s|\?>)/i.test(line))
      : -1;
    if (xmlDeclaration > 0) {
      diagnostics.push(
        `${file}:${xmlDeclaration + 1}: XML declaration must be the first syntactically valid line`,
      );
      continue;
    }
    const firstLine = lines[0]?.startsWith('#!') || xmlDeclaration === 0 ? 1 : 0;
    const requiredHeaders = [apacheNoticeLines, asciiApacheNoticeLines]
      .map((noticeLines) => expectedHeader(syntax, noticeLines));
    const actualHeader = lines.slice(firstLine, firstLine + apacheNoticeLines.length);
    if (!requiredHeaders.some((requiredHeader) => (
      requiredHeader.every((line, index) => actualHeader[index] === line)
    ))) {
      diagnostics.push(
        `${file}:${firstLine + 1}: expected the complete Greyfoundry Apache-2.0 notice at the first syntactically valid line`,
      );
    }
  }
  return diagnostics.sort();
}

async function main() {
  const diagnostics = await checkLicenseHeaders(process.argv[2] ?? process.cwd());
  if (diagnostics.length > 0) {
    process.stderr.write(`License notice violations:\n${diagnostics.map((item) => `- ${item}`).join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('Complete Greyfoundry Apache-2.0 notices are correctly positioned.\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
