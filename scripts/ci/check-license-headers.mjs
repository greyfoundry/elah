// SPDX-FileCopyrightText: 2026 Greyfoundry contributors
// SPDX-License-Identifier: Apache-2.0 OR MIT

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
  if (['.gitattributes', '.gitignore', 'Dockerfile', 'Justfile', 'Makefile', 'justfile'].includes(basename)) {
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
    file.startsWith('LICENSES/') ||
    file.endsWith('.md')
  );
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function headerPattern(syntax, tag) {
  const closing = syntax.close ? `.*\\s${escapeRegex(syntax.close)}\\s*$` : '.*$';
  return new RegExp(`^${escapeRegex(syntax.open)}\\s+${tag}\\s+\\S${closing}`);
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
    const firstLine = lines[0]?.startsWith('#!') ? 1 : 0;
    const copyrightPattern = headerPattern(syntax, 'SPDX-FileCopyrightText:');
    const licenseTag = ['SPDX-License', 'Identifier:'].join('-');
    const licensePattern = headerPattern(syntax, licenseTag);

    if (!copyrightPattern.test(lines[firstLine] ?? '')) {
      diagnostics.push(
        `${file}:${firstLine + 1}: expected SPDX-FileCopyrightText on the first syntactically valid line`,
      );
      continue;
    }
    if (!licensePattern.test(lines[firstLine + 1] ?? '')) {
      diagnostics.push(
        `${file}:${firstLine + 2}: expected SPDX-License-Identifier immediately after SPDX-FileCopyrightText`,
      );
    }
  }
  return diagnostics.sort();
}

async function main() {
  const diagnostics = await checkLicenseHeaders(process.argv[2] ?? process.cwd());
  if (diagnostics.length > 0) {
    process.stderr.write(`SPDX header violations:\n${diagnostics.map((item) => `- ${item}`).join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('SPDX headers are correctly positioned.\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
