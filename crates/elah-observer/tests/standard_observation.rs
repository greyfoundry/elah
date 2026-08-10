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

mod common;

use std::fs;

use common::{LevelFixture, RegionFixture, WorldFixture};
use elah_observer::{Bounds, ObserveRequest, ScanDepth, observe};

fn populated_world() -> WorldFixture {
    let fixture = WorldFixture::new();
    fixture.write_level(LevelFixture::default());

    let mut overworld = RegionFixture::new();
    overworld.add_chunk(31, 0, 1_700_000_010, 2, b"overworld");
    fixture.write_file("region/r.-1.0.mca", &overworld.into_bytes());

    fixture.write_file("DIM-1/region/r.0.0.mca", &RegionFixture::new().into_bytes());
    fixture.create_region_dir("DIM1/region");

    let mut custom = RegionFixture::new();
    custom.add_chunk(0, 0, 1_700_000_020, 3, b"custom");
    fixture.write_file(
        "dimensions/example/moon/region/r.1.-1.mca",
        &custom.into_bytes(),
    );
    fixture.write_file("data/operator-note.txt", b"fixture metadata");
    fixture
}

#[test]
fn aggregates_complete_standard_world_inventory_with_hand_derived_bounds() {
    let fixture = populated_world();
    let report = observe(
        ObserveRequest::new(fixture.root(), ScanDepth::Standard),
        |_| {},
    )
    .expect("unchanged world produces a report");

    assert_eq!(report.schema, "elah.observe/v1");
    assert_eq!(report.world.level_name.as_deref(), Some("Observer Fixture"));
    assert_eq!(report.world.data_version, Some(4440));
    assert_eq!(report.scan.depth, ScanDepth::Standard);
    assert!(report.scan.consistent);
    assert!(!report.scan.content_nbt_decoded);
    assert_eq!(report.totals.region_files, 3);
    assert_eq!(report.totals.occupied_chunks, 2);
    assert_eq!(report.totals.region_bytes, 32_768);
    assert!(report.totals.logical_bytes > report.totals.region_bytes);

    let ids: Vec<_> = report
        .dimensions
        .iter()
        .map(|dimension| dimension.id.as_str())
        .collect();
    assert_eq!(
        ids,
        [
            "example:moon",
            "minecraft:overworld",
            "minecraft:the_end",
            "minecraft:the_nether",
        ]
    );

    let custom = &report.dimensions[0];
    assert_eq!(custom.region_files, 1);
    assert_eq!(custom.occupied_chunks, 1);
    assert_eq!(custom.region_bytes, 12_288);
    assert_eq!(custom.storage_percent, 37.5);
    assert_eq!(
        custom.chunk_bounds,
        Some(Bounds {
            min_x: 32,
            max_x: 32,
            min_z: -32,
            max_z: -32,
        })
    );
    assert_eq!(
        custom.block_bounds,
        Some(Bounds {
            min_x: 512,
            max_x: 527,
            min_z: -512,
            max_z: -497,
        })
    );
    assert_eq!(custom.latest_region_timestamp_seconds, Some(1_700_000_020));

    let overworld = &report.dimensions[1];
    assert_eq!(
        overworld.chunk_bounds,
        Some(Bounds {
            min_x: -1,
            max_x: -1,
            min_z: 0,
            max_z: 0,
        })
    );
    assert_eq!(
        overworld.block_bounds,
        Some(Bounds {
            min_x: -16,
            max_x: -1,
            min_z: 0,
            max_z: 15,
        })
    );

    let end = &report.dimensions[2];
    assert_eq!(end.chunk_bounds, None);
    assert_eq!(end.block_bounds, None);
    assert_eq!(end.storage_percent, 0.0);

    let nether = &report.dimensions[3];
    assert_eq!(nether.region_files, 1);
    assert_eq!(nether.occupied_chunks, 0);
    assert_eq!(nether.region_bytes, 8192);
    assert_eq!(nether.storage_percent, 25.0);

    assert!(report.deep_validation.is_none());
    assert!(
        report
            .limitations
            .iter()
            .any(|value| value.contains("--deep"))
    );
}

#[test]
fn unchanged_standard_observations_are_byte_for_byte_deterministic_as_json() {
    let fixture = populated_world();
    let first = observe(
        ObserveRequest::new(fixture.root(), ScanDepth::Standard),
        |_| {},
    )
    .expect("first observation succeeds");
    let second = observe(
        ObserveRequest::new(fixture.root(), ScanDepth::Standard),
        |_| {},
    )
    .expect("second observation succeeds");

    let first_json = serde_json::to_vec(&first).expect("first report serializes");
    let second_json = serde_json::to_vec(&second).expect("second report serializes");
    assert_eq!(first_json, second_json);
}

#[test]
fn standard_observation_preserves_fixture_bytes_lengths_and_modification_times() {
    let fixture = populated_world();
    let paths = [
        "level.dat",
        "region/r.-1.0.mca",
        "DIM-1/region/r.0.0.mca",
        "dimensions/example/moon/region/r.1.-1.mca",
        "data/operator-note.txt",
    ];
    let capture = || {
        paths.map(|relative| {
            let path = fixture.path(relative);
            let metadata = fs::metadata(&path).expect("fixture metadata is readable");
            (
                relative,
                fs::read(&path).expect("fixture bytes are readable"),
                metadata.len(),
                metadata.modified().ok(),
            )
        })
    };
    let before = capture();

    observe(
        ObserveRequest::new(fixture.root(), ScanDepth::Standard),
        |_| {},
    )
    .expect("unchanged world produces a report");

    assert_eq!(capture(), before);
}
