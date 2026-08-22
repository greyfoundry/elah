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

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::evidence::fingerprint_file;
use crate::snapshot::ObservationSnapshot;
use crate::{
    Bounds, DeepValidation, DimensionReport, NumericDistribution, ObservationError,
    ObservationLimits, REPORT_SCHEMA, RegionScan, ScanDepth, ScanSummary, TextDistribution,
    WorldIdentity, WorldReport, WorldTotals, checked_json_integer, decode_chunk, discover_world,
    read_level, scan_region_standard,
};

/// Complete request for one world observation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ObserveRequest {
    /// Selected world root.
    pub world: PathBuf,
    /// Requested scan depth.
    pub depth: ScanDepth,
}

impl ObserveRequest {
    /// Creates an observation request.
    pub fn new(world: impl AsRef<Path>, depth: ScanDepth) -> Self {
        Self {
            world: world.as_ref().to_path_buf(),
            depth,
        }
    }
}

/// Progress boundary emitted without mixing notices into report stdout.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ObservationEvent {
    /// Standard structure and totals have been collected.
    StandardScanComplete {
        /// Occupied terrain chunks found by the standard pass.
        occupied_chunks: u64,
        /// Logical terrain region bytes found by the standard pass.
        region_bytes: u64,
    },
    /// Deep payload decoding is about to begin.
    DeepScanStarting {
        /// Occupied terrain chunks scheduled for decoding.
        occupied_chunks: u64,
        /// Logical terrain region bytes scheduled for reading.
        region_bytes: u64,
    },
    /// Elah is beginning the second evidence pass.
    VerifyingConsistency,
}

struct StandardPass {
    report: WorldReport,
    snapshot: ObservationSnapshot,
    regions: Vec<RegionScan>,
}

/// Observes a world and returns only after a matching evidence pass.
pub fn observe<F>(request: ObserveRequest, mut on_event: F) -> Result<WorldReport, ObservationError>
where
    F: FnMut(&ObservationEvent),
{
    let limits = ObservationLimits::default();
    let mut first = scan_standard_once(&request, limits)?;
    on_event(&ObservationEvent::StandardScanComplete {
        occupied_chunks: first.report.totals.occupied_chunks,
        region_bytes: first.report.totals.region_bytes,
    });
    if request.depth == ScanDepth::Deep {
        on_event(&ObservationEvent::DeepScanStarting {
            occupied_chunks: first.report.totals.occupied_chunks,
            region_bytes: first.report.totals.region_bytes,
        });
        add_deep_evidence(&mut first)?;
        first.report.deep_validation = Some(validate_deep_chunks(&first.regions, limits)?);
        first.report.scan.depth = ScanDepth::Deep;
        first.report.scan.content_nbt_decoded = true;
        first.report.limitations = vec![
            "Deep validation decodes bounded schema-light chunk metadata; it does not interpret gameplay semantics."
                .to_owned(),
            "Saved timestamps and filesystem times are metadata, not proof of player activity."
                .to_owned(),
        ];
    }
    on_event(&ObservationEvent::VerifyingConsistency);
    let mut second = scan_standard_once(&request, limits)?;
    if request.depth == ScanDepth::Deep {
        add_deep_evidence(&mut second)?;
    }
    first.snapshot.compare(&second.snapshot, limits)?;

    let mut report = first.report;
    report.scan.consistent = true;
    Ok(report)
}

fn scan_standard_once(
    request: &ObserveRequest,
    limits: ObservationLimits,
) -> Result<StandardPass, ObservationError> {
    let world = discover_world(&request.world, limits)?;
    let (level, level_evidence) = read_level(&world.level_dat, limits)?;
    let mut region_scans = Vec::new();
    for dimension in &world.dimensions {
        let Some(region_directory) = &dimension.region_directory else {
            continue;
        };
        for region_file in world.inventory.iter().filter(|file| {
            file.absolute_path.parent() == Some(region_directory.as_path())
                && matches!(
                    file.absolute_path
                        .extension()
                        .and_then(|value| value.to_str()),
                    Some("mca" | "mcr")
                )
        }) {
            region_scans.push(scan_region_standard(
                &world.root,
                region_file,
                &dimension.id,
                limits,
            )?);
        }
    }
    region_scans.sort_by(|left, right| {
        left.dimension_id
            .cmp(&right.dimension_id)
            .then(left.coordinate.x.cmp(&right.coordinate.x))
            .then(left.coordinate.z.cmp(&right.coordinate.z))
    });

    let logical_bytes = checked_json_integer(
        world.inventory.iter().try_fold(0_u64, |total, file| {
            total.checked_add(file.logical_bytes).ok_or_else(|| {
                ObservationError::unsafe_input(
                    "World logical byte totals exceed the supported range.",
                    "Observe a smaller filesystem snapshot, then try again.",
                    "logical byte total overflowed",
                )
            })
        })?,
        "logical_bytes",
    )?;
    let region_bytes = checked_json_integer(
        region_scans.iter().try_fold(0_u64, |total, region| {
            total.checked_add(region.logical_bytes).ok_or_else(|| {
                ObservationError::unsafe_input(
                    "Region byte totals exceed the supported range.",
                    "Observe a smaller filesystem snapshot, then try again.",
                    "region byte total overflowed",
                )
            })
        })?,
        "region_bytes",
    )?;
    let region_files = checked_json_integer(region_scans.len() as u64, "region_files")?;
    let occupied_chunks = checked_json_integer(
        region_scans.iter().try_fold(0_u64, |total, region| {
            total
                .checked_add(region.chunks.len() as u64)
                .ok_or_else(|| {
                    ObservationError::unsafe_input(
                        "Occupied chunk totals exceed the supported range.",
                        "Observe a smaller filesystem snapshot, then try again.",
                        "occupied chunk total overflowed",
                    )
                })
        })?,
        "occupied_chunks",
    )?;
    let dimensions = aggregate_dimensions(&world, &region_scans, region_bytes)?;
    let resolved_path = world.root.to_str().ok_or_else(|| {
        ObservationError::unsupported_world(
            "The world root cannot be represented as Unicode in a report.",
            "Observe a snapshot whose root path can be represented as Unicode, then try again.",
            world.root.display().to_string(),
        )
    })?;
    let snapshot = ObservationSnapshot::from_standard_pass(&world, &level_evidence, &region_scans);
    Ok(StandardPass {
        report: WorldReport {
            schema: REPORT_SCHEMA.to_owned(),
            observer_version: env!("CARGO_PKG_VERSION").to_owned(),
            world: WorldIdentity {
                resolved_path: resolved_path.to_owned(),
                level_name: level.level_name,
                data_version: level.data_version,
                version_name: level.version_name,
                last_played_millis: level.last_played_millis,
            },
            scan: ScanSummary {
                depth: ScanDepth::Standard,
                consistent: false,
                content_nbt_decoded: false,
            },
            totals: WorldTotals {
                logical_bytes,
                region_bytes,
                region_files,
                occupied_chunks,
            },
            dimensions,
            deep_validation: None,
            limitations: vec![
                "Chunk NBT payloads were not decoded; run with --deep for bounded content validation."
                    .to_owned(),
                "Saved timestamps and filesystem times are metadata, not proof of player activity."
                    .to_owned(),
            ],
        },
        snapshot,
        regions: region_scans,
    })
}

fn add_deep_evidence(pass: &mut StandardPass) -> Result<(), ObservationError> {
    let mut inputs = BTreeMap::new();
    for region in &pass.regions {
        inputs.insert(region.source.relative_path.clone(), region.source.clone());
        for chunk in &region.chunks {
            if let Some(external) = &chunk.external_file {
                inputs.insert(external.relative_path.clone(), external.clone());
            }
        }
    }
    for input in inputs.values() {
        let evidence = fingerprint_file(input)?;
        pass.snapshot.add_full_evidence(&evidence);
    }
    Ok(())
}

fn validate_deep_chunks(
    regions: &[RegionScan],
    limits: ObservationLimits,
) -> Result<DeepValidation, ObservationError> {
    let mut decoded_chunks = 0_u64;
    let mut data_versions = BTreeMap::<i64, u64>::new();
    let mut statuses = BTreeMap::<String, u64>::new();
    for region in regions {
        for chunk in &region.chunks {
            let metadata = decode_chunk(&region.source, chunk, limits)?;
            decoded_chunks = decoded_chunks.checked_add(1).ok_or_else(|| {
                ObservationError::unsafe_input(
                    "Decoded chunk totals exceed the supported range.",
                    "Observe a smaller filesystem snapshot, then try again.",
                    "decoded chunk counter overflowed",
                )
            })?;
            if let Some(value) = metadata.data_version {
                increment_count(&mut data_versions, i64::from(value))?;
            }
            if let Some(value) = metadata.status {
                increment_count(&mut statuses, value)?;
            }
        }
    }
    Ok(DeepValidation {
        decoded_chunks: checked_json_integer(decoded_chunks, "decoded_chunks")?,
        data_versions: data_versions
            .into_iter()
            .map(|(value, count)| NumericDistribution { value, count })
            .collect(),
        statuses: statuses
            .into_iter()
            .map(|(value, count)| TextDistribution { value, count })
            .collect(),
    })
}

fn increment_count<K: Ord>(counts: &mut BTreeMap<K, u64>, key: K) -> Result<(), ObservationError> {
    let count = counts.entry(key).or_default();
    *count = count.checked_add(1).ok_or_else(|| {
        ObservationError::unsafe_input(
            "A deep-validation distribution exceeds the supported range.",
            "Observe a smaller filesystem snapshot, then try again.",
            "distribution counter overflowed",
        )
    })?;
    Ok(())
}

fn aggregate_dimensions(
    world: &crate::DiscoveredWorld,
    regions: &[RegionScan],
    total_region_bytes: u64,
) -> Result<Vec<DimensionReport>, ObservationError> {
    let mut reports = Vec::with_capacity(world.dimensions.len());
    for dimension in &world.dimensions {
        let matches: Vec<_> = regions
            .iter()
            .filter(|region| region.dimension_id == dimension.id)
            .collect();
        let region_bytes = matches.iter().map(|region| region.logical_bytes).sum();
        let chunks: Vec<_> = matches
            .iter()
            .flat_map(|region| region.chunks.iter())
            .collect();
        let chunk_bounds = bounds_for_chunks(&chunks);
        let block_bounds = chunk_bounds.map(block_bounds).transpose()?;
        let storage_percent = if total_region_bytes == 0 {
            0.0
        } else {
            ((region_bytes as f64 / total_region_bytes as f64 * 100.0) * 100.0).round() / 100.0
        };
        reports.push(DimensionReport {
            id: dimension.id.clone(),
            kind: dimension.kind.clone(),
            region_files: checked_json_integer(matches.len() as u64, "region_files")?,
            occupied_chunks: checked_json_integer(chunks.len() as u64, "occupied_chunks")?,
            region_bytes: checked_json_integer(region_bytes, "region_bytes")?,
            storage_percent,
            chunk_bounds,
            block_bounds,
            latest_region_timestamp_seconds: matches
                .iter()
                .filter_map(|region| region.latest_timestamp_seconds)
                .max(),
        });
    }
    Ok(reports)
}

fn bounds_for_chunks(chunks: &[&crate::ChunkRecord]) -> Option<Bounds> {
    let first = chunks.first()?;
    let mut bounds = Bounds {
        min_x: first.coordinate.x,
        max_x: first.coordinate.x,
        min_z: first.coordinate.z,
        max_z: first.coordinate.z,
    };
    for chunk in &chunks[1..] {
        bounds.min_x = bounds.min_x.min(chunk.coordinate.x);
        bounds.max_x = bounds.max_x.max(chunk.coordinate.x);
        bounds.min_z = bounds.min_z.min(chunk.coordinate.z);
        bounds.max_z = bounds.max_z.max(chunk.coordinate.z);
    }
    Some(bounds)
}

fn block_bounds(chunks: Bounds) -> Result<Bounds, ObservationError> {
    Ok(Bounds {
        min_x: checked_block_min(chunks.min_x)?,
        max_x: checked_block_max(chunks.max_x)?,
        min_z: checked_block_min(chunks.min_z)?,
        max_z: checked_block_max(chunks.max_z)?,
    })
}

fn checked_block_min(chunk: i64) -> Result<i64, ObservationError> {
    chunk.checked_mul(16).ok_or_else(|| {
        ObservationError::malformed_input(
            "Chunk bounds exceed the supported block-coordinate range.",
            "Use a known-good world snapshot, then try again.",
            format!("chunk coordinate {chunk} overflowed when multiplied by 16"),
        )
    })
}

fn checked_block_max(chunk: i64) -> Result<i64, ObservationError> {
    checked_block_min(chunk)?.checked_add(15).ok_or_else(|| {
        ObservationError::malformed_input(
            "Chunk bounds exceed the supported block-coordinate range.",
            "Use a known-good world snapshot, then try again.",
            format!("chunk coordinate {chunk} overflowed at its inclusive maximum"),
        )
    })
}
