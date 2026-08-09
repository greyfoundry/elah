// SPDX-FileCopyrightText: 2026 Greyfoundry contributors
// SPDX-License-Identifier: Apache-2.0 OR MIT

import assert from 'node:assert/strict';
import test from 'node:test';

import { createComponentIdentity } from '../src/component-identity.mjs';

test('component identity is immutable and carries the workspace version', () => {
  const identity = createComponentIdentity('elah-lab-bot');

  assert.deepEqual(identity, { name: 'elah-lab-bot', version: '0.0.1' });
  assert.equal(Object.isFrozen(identity), true);
});

test('component identity rejects a blank name', () => {
  assert.throws(() => createComponentIdentity('   '), /non-empty/);
});
