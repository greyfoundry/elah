// SPDX-FileCopyrightText: 2026 Greyfoundry contributors
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const excludedFiles = new Set([
  'gradle/wrapper/gradle-wrapper.jar',
  'gradlew',
  'gradlew.bat',
  'pnpm-lock.yaml',
]);
const slashCommentExtensions = new Set(['.cjs', '.gradle', '.java', '.js', '.jsx', '.kt', '.kts', '.mjs', '.proto', '.rs', '.ts', '.tsx']);
const hashCommentExtensions = new Set(['.bash', '.properties', '.ps1', '.py', '.rb', '.sh', '.toml', '.yaml', '.yml']);

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
    return '#';
  }
  const extension = path.posix.extname(file).toLowerCase();
  if (slashCommentExtensions.has(extension)) {
    return '//';
  }
  if (hashCommentExtensions.has(extension)) {
    return '#';
  }
  if (extension === '.bat' || extension === '.cmd') {
    return 'REM';
  }
  return undefined;
}

function isExcluded(file) {
  return (
    excludedFiles.has(file) ||
    file.startsWith('java/elah-api/src/generated/java/') ||
    file.startsWith('LICENSES/') ||
    file.endsWith('.md')
  );
}

export async function checkLicenseHeaders(root = process.cwd()) {
  const diagnostics = [];
  for (const file of await trackedFiles(root)) {
    const prefix = commentPrefix(file);
    if (!prefix || isExcluded(file)) {
      continue;
    }

    const contents = (await readFile(path.join(root, file), 'utf8')).replace(/^\uFEFF/, '');
    const lines = contents.split(/\r?\n/);
    const firstLine = lines[0]?.startsWith('#!') ? 1 : 0;
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const copyrightPattern = new RegExp(`^${escapedPrefix}\\s+SPDX-FileCopyrightText:\\s+\\S`);
    const licenseTag = ['SPDX-License', 'Identifier:'].join('-');
    const licensePattern = new RegExp(`^${escapedPrefix}\\s+${licenseTag}\\s+\\S`);

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
