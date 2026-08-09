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
const allowedStudyFiles = new Set(['studying/README.md', 'studying/manifest.lock']);
const scannerFiles = new Set([
  'scripts/ci/check-studying-boundary.mjs',
  'scripts/ci/check-studying-boundary.test.mjs',
]);
const sourceExtensions = new Set(['.cjs', '.java', '.js', '.jsx', '.kt', '.kts', '.mjs', '.proto', '.rs', '.ts', '.tsx']);

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

function referencedStudyPaths(line) {
  const references = [];
  const normalizedLine = line.replaceAll('\\', '/');
  const pattern = /(?:^|[\s"'`(=,:])([^\s"'`()=,:]*studying\/[A-Za-z0-9_.*-]+(?:\/[A-Za-z0-9_.*-]+)*)/g;
  for (const match of normalizedLine.matchAll(pattern)) {
    const candidate = match[1].replace(/^(?:\.{1,2}\/)+/, '');
    if (candidate.startsWith('studying/')) {
      references.push(candidate);
      continue;
    }
    const validatorBoundary = candidate.indexOf('/scripts/studying/');
    const firstStudyBoundary = candidate.indexOf('/studying/');
    const isRootedValidator = validatorBoundary >= 0
      && firstStudyBoundary === validatorBoundary + '/scripts'.length;
    if (candidate.startsWith('scripts/studying/') || isRootedValidator) {
      continue;
    }
    const rootBoundary = candidate.indexOf('/studying/');
    if (rootBoundary >= 0) {
      references.push(candidate.slice(rootBoundary + 1));
    }
  }
  return references;
}

export async function checkStudyingBoundary(root = process.cwd()) {
  const diagnostics = [];
  for (const file of await trackedFiles(root)) {
    if (file.startsWith('studying/') && !allowedStudyFiles.has(file)) {
      diagnostics.push(
        `${file}: tracked studying content is forbidden; only studying/README.md and studying/manifest.lock may be tracked`,
      );
      continue;
    }

    if (file.endsWith('.md') || file === '.gitignore' || scannerFiles.has(file)) {
      continue;
    }

    const contents = await readFile(path.join(root, file));
    if (contents.includes(0)) {
      continue;
    }

    const isSource = sourceExtensions.has(path.extname(file).toLowerCase());
    const lines = contents.toString('utf8').split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      for (const reference of referencedStudyPaths(line)) {
        const isAllowedMetadata = allowedStudyFiles.has(reference);
        const isSourceImport = isSource && /\b(?:import|include|include_bytes|include_str|require)\b/.test(line);
        if (!isAllowedMetadata || isSourceImport) {
          diagnostics.push(`${file}:${index + 1}: forbidden studying checkout reference: ${reference}`);
        }
      }
    }
  }
  return diagnostics.sort();
}

async function main() {
  const diagnostics = await checkStudyingBoundary(process.argv[2] ?? process.cwd());
  if (diagnostics.length > 0) {
    process.stderr.write(`Studying boundary violations:\n${diagnostics.map((item) => `- ${item}`).join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('Studying boundary is clean.\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
