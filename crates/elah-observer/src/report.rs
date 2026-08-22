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

use serde::Serialize;

/// Observer scan depth requested by the operator.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanDepth {
    /// Inspect report-driving metadata, headers, and chunk envelopes.
    Standard,
    /// Additionally decode and parse every occupied terrain chunk.
    Deep,
}

/// Hard limits applied before data is accepted into a report.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ObservationLimits {
    /// Maximum compressed `level.dat` bytes.
    pub max_compressed_level_bytes: usize,
    /// Maximum decompressed `level.dat` bytes.
    pub max_decompressed_level_bytes: usize,
    /// Maximum compressed external chunk bytes.
    pub max_compressed_external_chunk_bytes: usize,
    /// Maximum decompressed chunk NBT bytes.
    pub max_decompressed_chunk_bytes: usize,
    /// Maximum elements accepted in any NBT list or array.
    pub max_nbt_sequence_elements: usize,
    /// Maximum number of paths accepted beneath a world root.
    pub max_paths: usize,
    /// Maximum changed paths exposed by verbose diagnostics.
    pub max_changed_path_details: usize,
}

impl Default for ObservationLimits {
    fn default() -> Self {
        Self {
            max_compressed_level_bytes: 16 * 1024 * 1024,
            max_decompressed_level_bytes: 64 * 1024 * 1024,
            max_compressed_external_chunk_bytes: 128 * 1024 * 1024,
            max_decompressed_chunk_bytes: 128 * 1024 * 1024,
            max_nbt_sequence_elements: 1_000_000,
            max_paths: 1_000_000,
            max_changed_path_details: 50,
        }
    }
}

/// High-level identity and saved metadata for the selected world.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct WorldIdentity {
    /// Canonical path rendered for operators.
    pub resolved_path: String,
    /// Saved level name, when present.
    pub level_name: Option<String>,
    /// Saved Minecraft data version, when present.
    pub data_version: Option<i32>,
    /// Saved Minecraft version name, when present.
    pub version_name: Option<String>,
    /// Saved `LastPlayed` value in Unix epoch milliseconds, when present.
    pub last_played_millis: Option<i64>,
}

/// Evidence level attached to a successful report.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct ScanSummary {
    /// Requested and completed scan depth.
    pub depth: ScanDepth,
    /// Whether the second pass matched every report-driving input.
    pub consistent: bool,
    /// Whether every occupied terrain chunk NBT payload was decoded.
    pub content_nbt_decoded: bool,
}

/// Totals for the complete selected world tree.
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct WorldTotals {
    /// Logical bytes in all safe regular files.
    pub logical_bytes: u64,
    /// Logical bytes in terrain region files.
    pub region_bytes: u64,
    /// Terrain region file count.
    pub region_files: u64,
    /// Occupied terrain chunk count.
    pub occupied_chunks: u64,
}

/// Inclusive horizontal coordinates.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct Bounds {
    /// Minimum X coordinate.
    pub min_x: i64,
    /// Maximum X coordinate.
    pub max_x: i64,
    /// Minimum Z coordinate.
    pub min_z: i64,
    /// Maximum Z coordinate.
    pub max_z: i64,
}

/// Source layout for a discovered dimension.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DimensionKind {
    /// Root overworld layout.
    Overworld,
    /// `DIM-1` Nether layout.
    Nether,
    /// `DIM1` End layout.
    End,
    /// Namespaced custom dimension layout.
    Custom,
}

/// Aggregated terrain storage for one dimension.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DimensionReport {
    /// Stable namespaced identifier.
    pub id: String,
    /// Filesystem layout that supplied the dimension.
    pub kind: DimensionKind,
    /// Terrain region file count.
    pub region_files: u64,
    /// Occupied terrain chunk count.
    pub occupied_chunks: u64,
    /// Logical terrain region bytes.
    pub region_bytes: u64,
    /// Percentage of all terrain region bytes, rounded deterministically.
    pub storage_percent: f64,
    /// Inclusive occupied chunk bounds.
    pub chunk_bounds: Option<Bounds>,
    /// Inclusive horizontal block bounds derived from occupied chunks.
    pub block_bounds: Option<Bounds>,
    /// Latest nonzero Anvil header timestamp in Unix epoch seconds.
    pub latest_region_timestamp_seconds: Option<u64>,
}

/// Count of chunks carrying one numeric value.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct NumericDistribution {
    /// Observed value.
    pub value: i64,
    /// Chunks carrying the value.
    pub count: u64,
}

/// Count of chunks carrying one textual value.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct TextDistribution {
    /// Observed value.
    pub value: String,
    /// Chunks carrying the value.
    pub count: u64,
}

/// Complete deep-mode payload validation summary.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct DeepValidation {
    /// Successfully decoded terrain chunks.
    pub decoded_chunks: u64,
    /// Sorted saved data-version counts.
    pub data_versions: Vec<NumericDistribution>,
    /// Sorted chunk-status counts.
    pub statuses: Vec<TextDistribution>,
}

/// Complete successful Observer report.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct WorldReport {
    /// Stable report schema identifier.
    pub schema: String,
    /// Elah build version that produced the report.
    pub observer_version: String,
    /// Selected world identity and saved metadata.
    pub world: WorldIdentity,
    /// Completed evidence depth.
    pub scan: ScanSummary,
    /// Complete world totals.
    pub totals: WorldTotals,
    /// Deterministically sorted dimension reports.
    pub dimensions: Vec<DimensionReport>,
    /// Deep payload evidence, absent in standard mode.
    pub deep_validation: Option<DeepValidation>,
    /// Explicit facts the completed scan did not establish.
    pub limitations: Vec<String>,
}
