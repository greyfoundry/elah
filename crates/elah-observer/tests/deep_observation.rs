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

use std::fs::{self, File, FileTimes};

use common::{ChunkFixture, LevelFixture, RegionFixture, WorldFixture, compress_chunk};
use elah_observer::{
    ErrorKind, ObservationEvent, ObservationLimits, ObserveRequest, ScanDepth, decode_chunk,
    discover_world, observe, scan_region_standard,
};

fn scan_only_region(
    fixture: &WorldFixture,
) -> (elah_observer::RegionScan, elah_observer::DiscoveredWorld) {
    let world = discover_world(fixture.root(), ObservationLimits::default())
        .expect("fixture world is discovered");
    let region_file = world
        .inventory
        .iter()
        .find(|file| file.relative_path == "region/r.0.0.mca")
        .expect("region is discovered");
    let scan = scan_region_standard(
        &world.root,
        region_file,
        "minecraft:overworld",
        ObservationLimits::default(),
    )
    .expect("region structure is valid");
    (scan, world)
}

#[test]
fn deep_mode_decodes_all_compressions_external_chunks_and_distributions() {
    let fixture = WorldFixture::new();
    fixture.write_level(LevelFixture::default());
    let mut region = RegionFixture::new();
    for compression in 1_u8..=4 {
        let chunk = ChunkFixture::at(i32::from(compression - 1), 0);
        region.add_chunk(
            compression - 1,
            0,
            100 + u32::from(compression),
            compression,
            &compress_chunk(compression, &chunk.nbt_bytes()),
        );
    }
    let external = ChunkFixture::at(4, 0);
    region.add_chunk(4, 0, 105, 0x80 | 2, &[]);
    fixture.write_file("region/r.0.0.mca", &region.into_bytes());
    fixture.write_file(
        "region/c.4.0.mcc",
        &compress_chunk(2, &external.nbt_bytes()),
    );
    let mut events = Vec::new();

    let report = observe(
        ObserveRequest::new(fixture.root(), ScanDepth::Deep),
        |event| events.push(*event),
    )
    .expect("all supported chunk inputs decode");

    assert_eq!(report.scan.depth, ScanDepth::Deep);
    assert!(report.scan.content_nbt_decoded);
    assert!(report.scan.consistent);
    assert_eq!(report.totals.occupied_chunks, 5);
    let deep = report.deep_validation.expect("deep summary is present");
    assert_eq!(deep.decoded_chunks, 5);
    assert_eq!(deep.data_versions.len(), 1);
    assert_eq!(deep.data_versions[0].value, 4440);
    assert_eq!(deep.data_versions[0].count, 5);
    assert_eq!(deep.statuses.len(), 1);
    assert_eq!(deep.statuses[0].value, "minecraft:full");
    assert_eq!(deep.statuses[0].count, 5);
    assert!(events.iter().any(|event| matches!(
        event,
        ObservationEvent::DeepScanStarting {
            occupied_chunks: 5,
            ..
        }
    )));
    assert!(matches!(
        events.last(),
        Some(ObservationEvent::VerifyingConsistency)
    ));
}

#[test]
fn normalizes_current_and_legacy_chunk_metadata_layouts() {
    let fixture = WorldFixture::new();
    fixture.write_level(LevelFixture::default());
    let mut region = RegionFixture::new();
    let current = ChunkFixture::at(0, 0);
    let mut legacy = ChunkFixture::at(1, 0);
    legacy.legacy_level = true;
    region.add_chunk(0, 0, 1, 3, &current.nbt_bytes());
    region.add_chunk(1, 0, 2, 3, &legacy.nbt_bytes());
    fixture.write_file("region/r.0.0.mca", &region.into_bytes());
    let (scan, _) = scan_only_region(&fixture);

    let current_metadata =
        decode_chunk(&scan.source, &scan.chunks[0], ObservationLimits::default())
            .expect("current chunk decodes");
    let legacy_metadata = decode_chunk(&scan.source, &scan.chunks[1], ObservationLimits::default())
        .expect("legacy chunk decodes");

    assert_eq!(current_metadata.data_version, legacy_metadata.data_version);
    assert_eq!(current_metadata.status, legacy_metadata.status);
    assert_eq!(current_metadata.x_pos, Some(0));
    assert_eq!(legacy_metadata.x_pos, Some(1));
}

#[test]
fn rejects_decompression_limits_malformed_nbt_and_coordinate_mismatch() {
    let oversized = WorldFixture::new();
    oversized.write_level(LevelFixture::default());
    let mut oversized_region = RegionFixture::new();
    let oversized_nbt = ChunkFixture::at(0, 0).nbt_bytes();
    oversized_region.add_chunk(0, 0, 1, 3, &oversized_nbt);
    oversized.write_file("region/r.0.0.mca", &oversized_region.into_bytes());
    let (scan, _) = scan_only_region(&oversized);
    let limit_error = decode_chunk(
        &scan.source,
        &scan.chunks[0],
        ObservationLimits {
            max_decompressed_chunk_bytes: oversized_nbt.len() - 1,
            ..ObservationLimits::default()
        },
    )
    .expect_err("decompressed limit must fail");
    assert_eq!(limit_error.kind(), ErrorKind::UnsafeInput);

    let malformed = WorldFixture::new();
    malformed.write_level(LevelFixture::default());
    let mut malformed_region = RegionFixture::new();
    malformed_region.add_chunk(0, 0, 1, 3, b"not nbt");
    malformed.write_file("region/r.0.0.mca", &malformed_region.into_bytes());
    let (scan, _) = scan_only_region(&malformed);
    assert_eq!(
        decode_chunk(&scan.source, &scan.chunks[0], ObservationLimits::default(),)
            .expect_err("malformed NBT must fail")
            .kind(),
        ErrorKind::MalformedInput
    );

    let mismatch = WorldFixture::new();
    mismatch.write_level(LevelFixture::default());
    let mut mismatch_region = RegionFixture::new();
    mismatch_region.add_chunk(0, 0, 1, 3, &ChunkFixture::at(50, 50).nbt_bytes());
    mismatch.write_file("region/r.0.0.mca", &mismatch_region.into_bytes());
    let (scan, _) = scan_only_region(&mismatch);
    let mismatch_error = decode_chunk(&scan.source, &scan.chunks[0], ObservationLimits::default())
        .expect_err("embedded coordinates must agree");
    assert_eq!(mismatch_error.kind(), ErrorKind::MalformedInput);
    assert!(mismatch_error.summary().contains("coordinates"));
}

#[test]
fn enforces_external_compressed_limit_and_rejects_truncated_streams() {
    let external = WorldFixture::new();
    external.write_level(LevelFixture::default());
    let mut external_region = RegionFixture::new();
    external_region.add_chunk(0, 0, 1, 0x80 | 2, &[]);
    external.write_file("region/r.0.0.mca", &external_region.into_bytes());
    let compressed = compress_chunk(2, &ChunkFixture::at(0, 0).nbt_bytes());
    external.write_file("region/c.0.0.mcc", &compressed);
    let (scan, _) = scan_only_region(&external);
    let limit_error = decode_chunk(
        &scan.source,
        &scan.chunks[0],
        ObservationLimits {
            max_compressed_external_chunk_bytes: compressed.len() - 1,
            ..ObservationLimits::default()
        },
    )
    .expect_err("external compressed limit must fail");
    assert_eq!(limit_error.kind(), ErrorKind::UnsafeInput);

    let truncated = WorldFixture::new();
    truncated.write_level(LevelFixture::default());
    let mut truncated_region = RegionFixture::new();
    truncated_region.add_chunk(0, 0, 1, 2, b"truncated zlib");
    truncated.write_file("region/r.0.0.mca", &truncated_region.into_bytes());
    let (scan, _) = scan_only_region(&truncated);
    assert_eq!(
        decode_chunk(&scan.source, &scan.chunks[0], ObservationLimits::default(),)
            .expect_err("truncated compression stream must fail")
            .kind(),
        ErrorKind::MalformedInput
    );
}

#[test]
fn deep_mode_fails_closed_when_payload_bytes_change_after_decoding() {
    let fixture = WorldFixture::new();
    fixture.write_level(LevelFixture::default());
    let nbt = ChunkFixture::at(0, 0).nbt_bytes();
    let mut region = RegionFixture::new();
    region.add_chunk(0, 0, 1, 3, &nbt);
    fixture.write_file("region/r.0.0.mca", &region.into_bytes());
    let region_path = fixture.path("region/r.0.0.mca");
    let original_modified = fs::metadata(&region_path)
        .expect("fixture region metadata is readable")
        .modified()
        .expect("fixture region modification time is available");
    let mut mutated = false;

    let error = observe(
        ObserveRequest::new(fixture.root(), ScanDepth::Deep),
        |event| {
            if matches!(event, ObservationEvent::VerifyingConsistency) && !mutated {
                let mut bytes = fs::read(&region_path).expect("fixture region is readable");
                let payload_last = 2 * 4096 + 5 + nbt.len() - 1;
                bytes[payload_last] ^= 1;
                fs::write(&region_path, bytes).expect("test may mutate its temporary fixture");
                File::options()
                    .write(true)
                    .open(&region_path)
                    .expect("fixture region can restore its modification time")
                    .set_times(FileTimes::new().set_modified(original_modified))
                    .expect("fixture region modification time is restored");
                mutated = true;
            }
        },
    )
    .expect_err("changed deep payload must fail closed");

    assert_eq!(error.kind(), ErrorKind::Changed);
    assert!(
        error
            .details()
            .iter()
            .any(|line| line.contains("r.0.0.mca"))
    );
}
