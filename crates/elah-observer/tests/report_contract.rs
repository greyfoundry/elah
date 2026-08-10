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

use elah_observer::{
    Bounds, DimensionKind, DimensionReport, ErrorKind, REPORT_SCHEMA, ScanDepth, ScanSummary,
    WorldIdentity, WorldReport, WorldTotals, checked_json_integer,
};

fn overworld() -> DimensionReport {
    DimensionReport {
        id: "minecraft:overworld".to_owned(),
        kind: DimensionKind::Overworld,
        region_files: 1,
        occupied_chunks: 1,
        region_bytes: 8192,
        storage_percent: 100.0,
        chunk_bounds: Some(Bounds {
            min_x: 0,
            max_x: 0,
            min_z: 0,
            max_z: 0,
        }),
        block_bounds: Some(Bounds {
            min_x: 0,
            max_x: 15,
            min_z: 0,
            max_z: 15,
        }),
        latest_region_timestamp_seconds: Some(1_700_000_000),
    }
}

fn empty_end() -> DimensionReport {
    DimensionReport {
        id: "minecraft:the_end".to_owned(),
        kind: DimensionKind::End,
        region_files: 0,
        occupied_chunks: 0,
        region_bytes: 0,
        storage_percent: 0.0,
        chunk_bounds: None,
        block_bounds: None,
        latest_region_timestamp_seconds: None,
    }
}

#[test]
fn report_serializes_as_elah_observe_v1() {
    let report = WorldReport {
        schema: REPORT_SCHEMA.to_owned(),
        observer_version: "0.0.3".to_owned(),
        world: WorldIdentity {
            resolved_path: "/world".to_owned(),
            level_name: Some("Fixture".to_owned()),
            data_version: Some(4440),
            version_name: Some("fixture-version".to_owned()),
            last_played_millis: Some(1_700_000_000_000),
        },
        scan: ScanSummary {
            depth: ScanDepth::Standard,
            consistent: true,
            content_nbt_decoded: false,
        },
        totals: WorldTotals {
            logical_bytes: 16_384,
            region_bytes: 8192,
            region_files: 1,
            occupied_chunks: 1,
        },
        dimensions: vec![overworld(), empty_end()],
        deep_validation: None,
        limitations: vec!["chunk NBT was not decoded".to_owned()],
    };

    let value = serde_json::to_value(report).expect("report serializes");
    assert_eq!(value["schema"], "elah.observe/v1");
    assert_eq!(value["scan"]["depth"], "standard");
    assert_eq!(value["dimensions"][0]["region_bytes"], 8192);
    assert!(value["dimensions"][1]["chunk_bounds"].is_null());
}

#[test]
fn unsafe_json_integers_are_rejected_instead_of_rounded() {
    let error = checked_json_integer(9_007_199_254_740_992, "logical_bytes")
        .expect_err("inexact JSON integer must be rejected");

    assert_eq!(error.kind(), ErrorKind::UnsafeInput);
    assert_eq!(
        error.summary(),
        "The world is too large to report exact logical_bytes values in JSON."
    );
    assert!(error.recovery().contains("filesystem snapshot"));
}
