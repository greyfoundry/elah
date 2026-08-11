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

use std::error::Error;
use std::fmt::{self, Display, Formatter};

/// Immutable identity shared by Elah components.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ComponentIdentity {
    name: String,
}

impl ComponentIdentity {
    /// Creates an identity for a named component in this workspace.
    pub fn new(name: impl Into<String>) -> Result<Self, InvalidComponentName> {
        let name = name.into();
        if name.trim().is_empty() {
            return Err(InvalidComponentName);
        }

        Ok(Self { name })
    }

    /// Returns the component name.
    #[must_use]
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Returns the component version pinned by the Cargo workspace.
    #[must_use]
    pub const fn version(&self) -> &'static str {
        env!("CARGO_PKG_VERSION")
    }
}

/// Returned when a component name contains no non-whitespace characters.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct InvalidComponentName;

impl Display for InvalidComponentName {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> fmt::Result {
        formatter.write_str("component name must be non-empty")
    }
}

impl Error for InvalidComponentName {}
