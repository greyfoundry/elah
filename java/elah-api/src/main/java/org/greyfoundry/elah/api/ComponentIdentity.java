// SPDX-FileCopyrightText: 2026 Greyfoundry contributors
// SPDX-License-Identifier: Apache-2.0 OR MIT

package org.greyfoundry.elah.api;

/** Immutable identity for an Elah component. */
public final class ComponentIdentity {
    private static final String VERSION = "0.0.1";

    private final String name;

    private ComponentIdentity(String name) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("component name must be non-empty");
        }
        this.name = name;
    }

    public static ComponentIdentity of(String name) {
        return new ComponentIdentity(name);
    }

    public String name() {
        return name;
    }

    public String version() {
        return VERSION;
    }
}
