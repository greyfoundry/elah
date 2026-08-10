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

//! Read-only Minecraft Java world observation.

mod dimension;
mod error;
mod evidence;
mod level;
mod region;
mod report;
mod world;

pub use error::{ErrorKind, ObservationError};
pub use evidence::InputEvidence;
pub use level::{LevelMetadata, read_level};
pub use region::{
    ChunkCoordinate, ChunkRecord, Compression, RegionCoordinate, RegionEvidence, RegionScan,
    scan_region_standard,
};
pub use report::{
    Bounds, DeepValidation, DimensionKind, DimensionReport, NumericDistribution, ObservationLimits,
    ScanDepth, ScanSummary, TextDistribution, WorldIdentity, WorldReport, WorldTotals,
};
pub use world::{DiscoveredDimension, DiscoveredWorld, SafeFile, discover_world};

/// Stable schema identifier for successful Observer JSON reports.
pub const REPORT_SCHEMA: &str = "elah.observe/v1";

/// Largest integer that JSON consumers using IEEE-754 doubles can represent exactly.
pub const MAX_EXACT_JSON_INTEGER: u64 = 9_007_199_254_740_991;

/// Validates an unsigned integer before it enters the public JSON report.
pub fn checked_json_integer(value: u64, field: &'static str) -> Result<u64, ObservationError> {
    if value > MAX_EXACT_JSON_INTEGER {
        return Err(ObservationError::unsafe_input(
            format!("The world is too large to report exact {field} values in JSON."),
            "Use a smaller filesystem snapshot or split the observation into smaller worlds, then try again.",
            format!(
                "{field} was {value}; the maximum exact JSON integer is {MAX_EXACT_JSON_INTEGER}."
            ),
        ));
    }

    Ok(value)
}
