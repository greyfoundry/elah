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

use common::{LevelFixture, RegionFixture, WorldFixture};
use elah_observer::{
    ChunkCoordinate, Compression, ErrorKind, ObservationLimits, RegionCoordinate, discover_world,
    scan_region_standard,
};

fn discovered_region<'a>(
    world: &'a elah_observer::DiscoveredWorld,
    relative_path: &str,
) -> &'a elah_observer::SafeFile {
    world
        .inventory
        .iter()
        .find(|file| file.relative_path == relative_path)
        .expect("region is in the discovered inventory")
}

fn scan_fixture_region(
    fixture: &WorldFixture,
    relative_path: &str,
) -> Result<elah_observer::RegionScan, elah_observer::ObservationError> {
    let world = discover_world(fixture.root(), ObservationLimits::default())
        .expect("fixture world is discovered");
    scan_region_standard(
        &world.root,
        discovered_region(&world, relative_path),
        "minecraft:overworld",
        ObservationLimits::default(),
    )
}

#[test]
fn valid_region_reports_negative_coordinates_timestamps_and_envelopes() {
    let fixture = WorldFixture::new();
    fixture.write_level(LevelFixture::default());
    let mut region = RegionFixture::new();
    region.add_chunk(0, 0, 1_700_000_000, 2, b"first");
    region.add_chunk(31, 31, 1_700_000_123, 1, b"last");
    fixture.write_file("region/r.-2.3.mca", &region.into_bytes());
    let world = discover_world(fixture.root(), ObservationLimits::default())
        .expect("fixture world is discovered");

    let scan = scan_region_standard(
        &world.root,
        discovered_region(&world, "region/r.-2.3.mca"),
        "minecraft:overworld",
        ObservationLimits::default(),
    )
    .expect("valid region is scanned");

    assert_eq!(scan.coordinate, RegionCoordinate { x: -2, z: 3 });
    assert_eq!(scan.chunks.len(), 2);
    assert_eq!(scan.chunks[0].coordinate, ChunkCoordinate { x: -64, z: 96 });
    assert_eq!(scan.chunks[0].compression, Compression::Zlib);
    assert_eq!(
        scan.chunks[1].coordinate,
        ChunkCoordinate { x: -33, z: 127 }
    );
    assert_eq!(scan.chunks[1].compression, Compression::Gzip);
    assert_eq!(scan.latest_timestamp_seconds, Some(1_700_000_123));
    assert_eq!(scan.logical_bytes, 16_384);
    assert_eq!(scan.evidence.header_sha256.len(), 64);
    assert_eq!(scan.evidence.envelopes_sha256.len(), 64);
}

#[test]
fn empty_region_is_valid_and_has_no_fabricated_bounds_or_timestamp() {
    let fixture = WorldFixture::new();
    fixture.write_level(LevelFixture::default());
    fixture.write_file("region/r.0.0.mca", &RegionFixture::new().into_bytes());
    let world = discover_world(fixture.root(), ObservationLimits::default())
        .expect("fixture world is discovered");

    let scan = scan_region_standard(
        &world.root,
        discovered_region(&world, "region/r.0.0.mca"),
        "minecraft:overworld",
        ObservationLimits::default(),
    )
    .expect("empty region is valid");

    assert!(scan.chunks.is_empty());
    assert_eq!(scan.latest_timestamp_seconds, None);
    assert_eq!(scan.coordinate, RegionCoordinate { x: 0, z: 0 });
}

#[test]
fn rejects_a_region_file_that_is_not_sector_aligned() {
    let fixture = WorldFixture::new();
    fixture.write_level(LevelFixture::default());
    let mut bytes = RegionFixture::new().into_bytes();
    bytes.push(0);
    fixture.write_file("region/r.0.0.mca", &bytes);

    let error = scan_fixture_region(&fixture, "region/r.0.0.mca")
        .expect_err("non-sector-aligned region must fail");

    assert_eq!(error.kind(), ErrorKind::MalformedInput);
    assert!(error.details()[0].contains("sector-aligned"));
}

#[test]
fn recognizes_every_supported_anvil_compression_identifier() {
    let fixture = WorldFixture::new();
    fixture.write_level(LevelFixture::default());
    let mut region = RegionFixture::new();
    for (local_x, compression) in [1_u8, 2, 3, 4].into_iter().enumerate() {
        region.add_chunk(local_x as u8, 0, 100 + local_x as u32, compression, b"data");
    }
    fixture.write_file("region/r.0.0.mca", &region.into_bytes());
    let world = discover_world(fixture.root(), ObservationLimits::default())
        .expect("fixture world is discovered");

    let scan = scan_region_standard(
        &world.root,
        discovered_region(&world, "region/r.0.0.mca"),
        "minecraft:overworld",
        ObservationLimits::default(),
    )
    .expect("supported compression identifiers are structural inputs");

    let schemes: Vec<_> = scan.chunks.iter().map(|chunk| chunk.compression).collect();
    assert_eq!(
        schemes,
        [
            Compression::Gzip,
            Compression::Zlib,
            Compression::Uncompressed,
            Compression::Lz4,
        ]
    );
}

#[test]
fn rejects_partial_zero_and_header_sector_locations() {
    for (name, offset, sectors) in [("partial-zero", 2, 0), ("header-sector", 1, 1)] {
        let fixture = WorldFixture::new();
        fixture.write_level(LevelFixture::default());
        let mut region = RegionFixture::new();
        region.set_location(0, 0, offset, sectors);
        region.ensure_sector_count(3);
        region.set_envelope(2, 1, 2);
        let relative = format!("region/r.{offset}.{sectors}.mca");
        fixture.write_file(&relative, &region.into_bytes());

        let error = scan_fixture_region(&fixture, &relative)
            .expect_err("invalid location entry must be rejected");
        assert_eq!(error.kind(), ErrorKind::MalformedInput, "{name}");
    }
}

#[test]
fn rejects_out_of_file_and_overlapping_allocations() {
    let outside = WorldFixture::new();
    outside.write_level(LevelFixture::default());
    let mut outside_region = RegionFixture::new();
    outside_region.set_location(0, 0, 10, 1);
    outside.write_file("region/r.0.0.mca", &outside_region.into_bytes());
    assert_eq!(
        scan_fixture_region(&outside, "region/r.0.0.mca")
            .expect_err("out-of-file allocation must fail")
            .kind(),
        ErrorKind::MalformedInput
    );

    let overlap = WorldFixture::new();
    overlap.write_level(LevelFixture::default());
    let mut overlap_region = RegionFixture::new();
    overlap_region.add_chunk(0, 0, 1, 2, b"one");
    overlap_region.set_location(1, 0, 2, 1);
    overlap_region.set_timestamp(1, 0, 2);
    overlap.write_file("region/r.0.0.mca", &overlap_region.into_bytes());
    assert_eq!(
        scan_fixture_region(&overlap, "region/r.0.0.mca")
            .expect_err("overlapping allocations must fail")
            .kind(),
        ErrorKind::MalformedInput
    );
}

#[test]
fn rejects_invalid_chunk_lengths_and_truncated_envelopes() {
    for (name, length, file_length) in [
        ("zero-length", 0_u32, 3 * 4096),
        ("allocation-overflow", 4093_u32, 3 * 4096),
        ("truncated-envelope", 1_u32, 2 * 4096 + 4),
    ] {
        let fixture = WorldFixture::new();
        fixture.write_level(LevelFixture::default());
        let mut region = RegionFixture::new();
        region.set_location(0, 0, 2, 1);
        region.set_envelope(2, length, 2);
        region.truncate(file_length);
        let relative = format!("region/r.0.{length}.mca");
        fixture.write_file(&relative, &region.into_bytes());
        let error =
            scan_fixture_region(&fixture, &relative).expect_err("invalid chunk length must fail");
        assert_eq!(error.kind(), ErrorKind::MalformedInput, "{name}");
    }
}

#[test]
fn rejects_unknown_compression_and_missing_external_sidecars() {
    let unknown = WorldFixture::new();
    unknown.write_level(LevelFixture::default());
    let mut unknown_region = RegionFixture::new();
    unknown_region.add_chunk(0, 0, 1, 99, b"data");
    unknown.write_file("region/r.0.0.mca", &unknown_region.into_bytes());
    assert_eq!(
        scan_fixture_region(&unknown, "region/r.0.0.mca")
            .expect_err("unknown compression must fail")
            .kind(),
        ErrorKind::MalformedInput
    );

    let external = WorldFixture::new();
    external.write_level(LevelFixture::default());
    let mut external_region = RegionFixture::new();
    external_region.set_location(0, 0, 2, 1);
    external_region.ensure_sector_count(3);
    external_region.set_envelope(2, 1, 0x80 | 2);
    external.write_file("region/r.0.0.mca", &external_region.into_bytes());
    assert_eq!(
        scan_fixture_region(&external, "region/r.0.0.mca")
            .expect_err("missing external sidecar must fail")
            .kind(),
        ErrorKind::MalformedInput
    );
}

#[test]
fn rejects_invalid_region_names_and_legacy_mcr_files() {
    let invalid = WorldFixture::new();
    invalid.write_level(LevelFixture::default());
    invalid.write_file(
        "region/not-a-region.mca",
        &RegionFixture::new().into_bytes(),
    );
    assert_eq!(
        scan_fixture_region(&invalid, "region/not-a-region.mca")
            .expect_err("invalid name must fail")
            .kind(),
        ErrorKind::MalformedInput
    );

    let oversized = WorldFixture::new();
    oversized.write_level(LevelFixture::default());
    oversized.write_file(
        "region/r.999999999999.0.mca",
        &RegionFixture::new().into_bytes(),
    );
    assert_eq!(
        scan_fixture_region(&oversized, "region/r.999999999999.0.mca")
            .expect_err("coordinate outside i32 must fail")
            .kind(),
        ErrorKind::MalformedInput
    );

    let legacy = WorldFixture::new();
    legacy.write_level(LevelFixture::default());
    legacy.write_file("region/r.0.0.mcr", &RegionFixture::new().into_bytes());
    assert_eq!(
        scan_fixture_region(&legacy, "region/r.0.0.mcr")
            .expect_err("legacy region must be explicit")
            .kind(),
        ErrorKind::UnsupportedWorld
    );
}
