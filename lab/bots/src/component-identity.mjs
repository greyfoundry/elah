// SPDX-FileCopyrightText: 2026 Greyfoundry contributors
// SPDX-License-Identifier: Apache-2.0 OR MIT

const version = '0.0.1';

export function createComponentIdentity(name) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new TypeError('component name must be a non-empty string');
  }

  return Object.freeze({ name, version });
}
