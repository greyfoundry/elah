// SPDX-FileCopyrightText: 2026 Greyfoundry contributors
// SPDX-License-Identifier: Apache-2.0 OR MIT

package org.greyfoundry.elah.api;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

final class GeneratedComponentIdentityTest {
    @Test
    void generatedIdentityCarriesTheProtocolFields() {
        org.greyfoundry.elah.control.v1.ComponentIdentity identity =
                org.greyfoundry.elah.control.v1.ComponentIdentity.newBuilder()
                        .setComponentName("elah-api")
                        .setSemanticVersion("0.0.1")
                        .build();

        assertEquals("elah-api", identity.getComponentName());
        assertEquals("0.0.1", identity.getSemanticVersion());
    }
}
