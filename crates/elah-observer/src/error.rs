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

use serde::Serialize;
use thiserror::Error;

/// Stable categories used by the CLI to select recovery text and exit behavior.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    /// The selected path is not a supported Java Anvil world.
    UnsupportedWorld,
    /// The selected input violates a safety boundary or configured limit.
    UnsafeInput,
    /// A supported input is structurally invalid.
    MalformedInput,
    /// A read-only filesystem operation failed.
    Io,
    /// A report-driving input changed during the observation.
    Changed,
}

/// Actionable failure returned instead of an incomplete observation.
#[derive(Debug, Error)]
#[error("{summary}")]
pub struct ObservationError {
    kind: ErrorKind,
    summary: String,
    recovery: String,
    details: Vec<String>,
}

impl ObservationError {
    /// Creates an unsafe-input error with one technical detail.
    pub(crate) fn unsafe_input(
        summary: impl Into<String>,
        recovery: impl Into<String>,
        detail: impl Into<String>,
    ) -> Self {
        Self {
            kind: ErrorKind::UnsafeInput,
            summary: summary.into(),
            recovery: recovery.into(),
            details: vec![detail.into()],
        }
    }

    /// Returns the stable failure category.
    #[must_use]
    pub const fn kind(&self) -> ErrorKind {
        self.kind
    }

    /// Returns the plain-language description of what happened.
    #[must_use]
    pub fn summary(&self) -> &str {
        &self.summary
    }

    /// Returns the operator action most likely to resolve the failure.
    #[must_use]
    pub fn recovery(&self) -> &str {
        &self.recovery
    }

    /// Returns technical evidence intended for verbose output.
    #[must_use]
    pub fn details(&self) -> &[String] {
        &self.details
    }
}
