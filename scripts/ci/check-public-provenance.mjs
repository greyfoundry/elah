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
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const namedAttributions = [
  ['chat', 'gpt'],
  ['open', 'ai'],
  ['code', 'x'],
  ['clau', 'de'],
  ['anthro', 'pic'],
  ['co', 'pilot'],
  ['gem', 'ini'],
].map((parts) => parts.join(''));
const ambiguousAttributions = [
  ['cur', 'sor'],
].map((parts) => parts.join(''));
const automatedContributionsPolicyHeading = `## ${['AI', 'assisted'].join('-')} contributions`;
const markers = [
  {
    category: 'named model or tool',
    pattern: new RegExp(`\\b(?:${namedAttributions.join('|')})\\b`, 'i'),
  },
  {
    category: 'automated authorship claim',
    pattern: new RegExp(`\\b${['agent', 'authored'].join('[- ]')}\\b`, 'i'),
  },
  {
    category: 'automated authorship claim',
    pattern: new RegExp(`\\b${['ai', 'assisted'].join('[- ]')}\\b`, 'i'),
  },
  {
    category: 'automated authorship claim',
    pattern: new RegExp(`\\b${['ai', 'authored'].join('[- ]')}\\b`, 'i'),
  },
  {
    category: 'automated authorship claim',
    pattern: new RegExp(`\\b${['llm', 'generated'].join('[- ]')}\\b`, 'i'),
  },
  {
    category: 'automated authorship claim',
    pattern: new RegExp(`\\b${['ai', 'generated'].join('[- ]')}\\b`, 'i'),
  },
  {
    category: 'automated authorship claim',
    pattern: new RegExp(`\\bgenerated\\s+by\\s+(?:an?\\s+)?(?:${['ai', ...namedAttributions].join('|')})\\b`, 'i'),
  },
  {
    category: 'named model or tool',
    pattern: new RegExp(
      `\\b(?:authored|built|created|generated|made|written)\\s+(?:by|using|with)\\s+(?:${ambiguousAttributions.join('|')})\\b|\\b(?:${ambiguousAttributions.join('|')})[- ](?:assisted|authored|generated)\\b`,
      'i',
    ),
  },
];

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

export async function checkPublicProvenance(root = process.cwd()) {
  const diagnostics = [];
  for (const file of await trackedFiles(root)) {
    const contents = await readFile(path.join(root, file));
    if (contents.includes(0)) {
      continue;
    }
    const lines = contents.toString('utf8').split(/\r?\n/);
    let inAutomatedContributionsPolicy = false;
    for (const [index, line] of lines.entries()) {
      if (file === 'CONTRIBUTING.md' && line.startsWith('## ')) {
        inAutomatedContributionsPolicy = line.trim() === automatedContributionsPolicyHeading;
      }
      for (const marker of markers) {
        if (inAutomatedContributionsPolicy && marker.category === 'automated authorship claim') {
          continue;
        }
        if (marker.pattern.test(line)) {
          diagnostics.push(`${file}:${index + 1}: public provenance policy violation: ${marker.category}`);
        }
      }
    }
  }
  return diagnostics.sort();
}

async function main() {
  const diagnostics = await checkPublicProvenance(process.argv[2] ?? process.cwd());
  if (diagnostics.length > 0) {
    process.stderr.write(`Public provenance violations:\n${diagnostics.map((item) => `- ${item}`).join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('Public provenance is clean.\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
