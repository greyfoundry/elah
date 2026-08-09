// SPDX-FileCopyrightText: 2026 Greyfoundry contributors
// SPDX-License-Identifier: Apache-2.0 OR MIT

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
  ['cur', 'sor'],
  ['gem', 'ini'],
].map((parts) => parts.join(''));
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
    for (const [index, line] of lines.entries()) {
      for (const marker of markers) {
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
