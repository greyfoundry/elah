// SPDX-FileCopyrightText: 2026 Greyfoundry contributors
// SPDX-License-Identifier: Apache-2.0 OR MIT

package org.greyfoundry.elah.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

final class ComponentIdentityTest {
  @Test
  void identityHasTheRequestedNameAndWorkspaceVersion() {
    ComponentIdentity identity = ComponentIdentity.of("elah-api");

    assertEquals("elah-api", identity.name());
    assertEquals("0.0.1", identity.version());
  }

  @Test
  void identityRejectsABlankName() {
    assertThrows(IllegalArgumentException.class, () -> ComponentIdentity.of("   "));
  }
}
