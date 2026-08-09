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
