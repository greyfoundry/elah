// SPDX-FileCopyrightText: 2026 Greyfoundry contributors
// SPDX-License-Identifier: Apache-2.0 OR MIT

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkStudyingBoundary } from './check-studying-boundary.mjs';

async function withTrackedFiles(files, callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'elah-studying-boundary-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    for (const [relativePath, contents] of Object.entries(files)) {
      const absolutePath = path.join(root, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents);
    }
    execFileSync('git', ['add', '--force', '.'], { cwd: root });
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('rejects a source import from a studying checkout', async () => {
  await withTrackedFiles(
    {
      'src/bridge.mjs': "// SPDX-FileCopyrightText: 2026 Greyfoundry contributors\n// SPDX-License-Identifier: Apache-2.0 OR MIT\n\nimport worker from '../studying/papermc/Folia/Worker.js';\n",
    },
    async (root) => {
      assert.deepEqual(await checkStudyingBoundary(root), [
        'src/bridge.mjs:4: forbidden studying checkout reference: studying/papermc/Folia/Worker.js',
      ]);
    },
  );
});

test('rejects a build reference to a studying checkout', async () => {
  await withTrackedFiles(
    {
      'build.gradle.kts': "// SPDX-FileCopyrightText: 2026 Greyfoundry contributors\n// SPDX-License-Identifier: Apache-2.0 OR MIT\n\nsourceSets.main { java.srcDir(\"studying/papermc/Folia\") }\n",
    },
    async (root) => {
      assert.match((await checkStudyingBoundary(root)).join('\n'), /build\.gradle\.kts:4: forbidden studying checkout reference/);
    },
  );
});

test('rejects a packaging path into a studying checkout', async () => {
  await withTrackedFiles(
    {
      Dockerfile: '# SPDX-FileCopyrightText: 2026 Greyfoundry contributors\n# SPDX-License-Identifier: Apache-2.0 OR MIT\n\nCOPY studying/papermc/Folia /srv/folia\n',
    },
    async (root) => {
      assert.match((await checkStudyingBoundary(root)).join('\n'), /Dockerfile:4: forbidden studying checkout reference/);
    },
  );
});

test('rejects tracked content below the studying metadata boundary', async () => {
  await withTrackedFiles(
    {
      'studying/README.md': '# Study policy\n',
      'studying/manifest.lock': '{}\n',
      'studying/papermc/Folia/settings.gradle.kts': '// upstream checkout\n',
    },
    async (root) => {
      assert.deepEqual(await checkStudyingBoundary(root), [
        'studying/papermc/Folia/settings.gradle.kts: tracked studying content is forbidden; only studying/README.md and studying/manifest.lock may be tracked',
      ]);
    },
  );
});

test('allows the tracked study metadata and documentation references to its policy', async () => {
  await withTrackedFiles(
    {
      'studying/README.md': '# Study policy\n',
      'studying/manifest.lock': '{}\n',
      'docs/upstreams.md': 'See `studying/manifest.lock`; never package `studying/papermc/Folia`.\n',
      'package.json': '{"scripts":{"validate":"node check.mjs studying/manifest.lock"}}\n',
    },
    async (root) => {
      assert.deepEqual(await checkStudyingBoundary(root), []);
    },
  );
});
