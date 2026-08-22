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

use std::collections::{BTreeMap, BTreeSet};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{DiscoveredWorld, InputEvidence, ObservationError, ObservationLimits, RegionScan};

#[derive(Clone, Debug, Eq, PartialEq)]
struct SnapshotValue {
    logical_bytes: u64,
    modified: String,
    fingerprints: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ObservationSnapshot {
    entries: BTreeMap<String, SnapshotValue>,
}

impl ObservationSnapshot {
    pub(crate) fn from_standard_pass(
        world: &DiscoveredWorld,
        level: &InputEvidence,
        regions: &[RegionScan],
    ) -> Self {
        let mut entries = BTreeMap::new();
        for file in &world.inventory {
            entries.insert(
                file.relative_path.clone(),
                SnapshotValue {
                    logical_bytes: file.logical_bytes,
                    modified: time_key(file.modified),
                    fingerprints: Vec::new(),
                },
            );
        }
        let level_entry = entries
            .entry(level.relative_path.clone())
            .or_insert_with(|| SnapshotValue {
                logical_bytes: level.logical_bytes,
                modified: time_key(level.modified),
                fingerprints: Vec::new(),
            });
        level_entry
            .fingerprints
            .push(format!("level:{}", level.sha256));

        for region in regions {
            let entry = entries
                .entry(region.source.relative_path.clone())
                .or_insert_with(|| SnapshotValue {
                    logical_bytes: region.logical_bytes,
                    modified: time_key(region.evidence.modified),
                    fingerprints: Vec::new(),
                });
            entry
                .fingerprints
                .push(format!("header:{}", region.evidence.header_sha256));
            entry
                .fingerprints
                .push(format!("envelopes:{}", region.evidence.envelopes_sha256));
        }
        for dimension in &world.dimensions {
            entries.insert(
                format!("@dimension/{}", dimension.id),
                SnapshotValue {
                    logical_bytes: 0,
                    modified: String::new(),
                    fingerprints: vec![format!("kind:{:?}", dimension.kind)],
                },
            );
        }
        Self { entries }
    }

    pub(crate) fn compare(
        &self,
        current: &Self,
        limits: ObservationLimits,
    ) -> Result<(), ObservationError> {
        if self == current {
            return Ok(());
        }

        let paths: BTreeSet<_> = self
            .entries
            .keys()
            .chain(current.entries.keys())
            .cloned()
            .collect();
        let mut changes = Vec::new();
        for path in paths {
            match (self.entries.get(&path), current.entries.get(&path)) {
                (None, Some(_)) => changes.push(format!("added: {path}")),
                (Some(_), None) => changes.push(format!("removed: {path}")),
                (Some(before), Some(after)) if before != after => {
                    changes.push(format!("modified: {path}"));
                }
                _ => {}
            }
        }

        let limit = limits.max_changed_path_details.max(1);
        let details = if changes.len() > limit {
            let omitted = changes.len() - (limit - 1);
            let mut bounded: Vec<_> = changes.into_iter().take(limit - 1).collect();
            bounded.push(format!("{omitted} more changed inputs were omitted."));
            bounded
        } else {
            changes
        };
        Err(ObservationError::changed_inputs(details))
    }

    pub(crate) fn add_full_evidence(&mut self, evidence: &InputEvidence) {
        let entry = self
            .entries
            .entry(evidence.relative_path.clone())
            .or_insert_with(|| SnapshotValue {
                logical_bytes: evidence.logical_bytes,
                modified: time_key(evidence.modified),
                fingerprints: Vec::new(),
            });
        entry.logical_bytes = evidence.logical_bytes;
        entry.modified = time_key(evidence.modified);
        entry.fingerprints.push(format!("full:{}", evidence.sha256));
        entry.fingerprints.sort();
        entry.fingerprints.dedup();
    }
}

fn time_key(time: Option<SystemTime>) -> String {
    match time {
        None => "unavailable".to_owned(),
        Some(value) => match value.duration_since(UNIX_EPOCH) {
            Ok(duration) => format!("after:{}", duration.as_nanos()),
            Err(error) => format!("before:{}", error.duration().as_nanos()),
        },
    }
}
