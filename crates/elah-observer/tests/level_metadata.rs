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

use common::{LevelFixture, WorldFixture};
use elah_observer::{ErrorKind, ObservationLimits, discover_world, read_level};

#[test]
fn reads_saved_level_metadata_and_evidence_from_exact_compressed_bytes() {
    let fixture = WorldFixture::new();
    let compressed = fixture.write_level(LevelFixture::default());
    let world = discover_world(fixture.root(), ObservationLimits::default())
        .expect("fixture world is discovered");

    let (level, evidence) = read_level(&world.level_dat, ObservationLimits::default())
        .expect("valid level metadata is readable");

    assert_eq!(level.level_name.as_deref(), Some("Observer Fixture"));
    assert_eq!(level.data_version, Some(4440));
    assert_eq!(level.version_name.as_deref(), Some("fixture-version"));
    assert_eq!(level.last_played_millis, Some(1_700_000_000_000));
    assert_eq!(evidence.relative_path, "level.dat");
    assert_eq!(evidence.logical_bytes, compressed.len() as u64);
    assert_eq!(evidence.sha256.len(), 64);
}

#[test]
fn accepts_level_metadata_with_optional_fields_absent() {
    let fixture = WorldFixture::new();
    fixture.write_level(LevelFixture {
        level_name: None,
        data_version: None,
        version_name: None,
        include_empty_version: false,
        last_played_millis: None,
    });
    let world = discover_world(fixture.root(), ObservationLimits::default())
        .expect("fixture world is discovered");

    let (level, _) = read_level(&world.level_dat, ObservationLimits::default())
        .expect("optional fields may be absent");

    assert_eq!(level.level_name, None);
    assert_eq!(level.data_version, None);
    assert_eq!(level.version_name, None);
    assert_eq!(level.last_played_millis, None);
}

#[test]
fn accepts_a_version_compound_without_a_name() {
    let fixture = WorldFixture::new();
    fixture.write_level(LevelFixture {
        level_name: Some("Partial Version".to_owned()),
        data_version: Some(4440),
        version_name: None,
        include_empty_version: true,
        last_played_millis: None,
    });
    let world = discover_world(fixture.root(), ObservationLimits::default())
        .expect("fixture world is discovered");

    let (level, _) = read_level(&world.level_dat, ObservationLimits::default())
        .expect("missing optional version name is accepted");

    assert_eq!(level.version_name, None);
}

#[test]
fn rejects_malformed_gzip_or_nbt_instead_of_returning_partial_metadata() {
    let fixture = WorldFixture::new();
    fixture.write_file("level.dat", b"not a GZip NBT document");
    let world = discover_world(fixture.root(), ObservationLimits::default())
        .expect("fixture path is discovered before content parsing");

    let error = read_level(&world.level_dat, ObservationLimits::default())
        .expect_err("malformed level metadata must fail");

    assert_eq!(error.kind(), ErrorKind::MalformedInput);
    assert!(error.summary().contains("level.dat"));
    assert!(error.recovery().contains("snapshot"));
}

#[test]
fn enforces_compressed_and_decompressed_level_limits() {
    let fixture = WorldFixture::new();
    let compressed = fixture.write_level(LevelFixture::default());
    let world = discover_world(fixture.root(), ObservationLimits::default())
        .expect("fixture world is discovered");

    let compressed_error = read_level(
        &world.level_dat,
        ObservationLimits {
            max_compressed_level_bytes: compressed.len() - 1,
            ..ObservationLimits::default()
        },
    )
    .expect_err("compressed limit must fail");
    assert_eq!(compressed_error.kind(), ErrorKind::UnsafeInput);
    assert!(compressed_error.summary().contains("compressed"));

    let decompressed_error = read_level(
        &world.level_dat,
        ObservationLimits {
            max_decompressed_level_bytes: 1,
            ..ObservationLimits::default()
        },
    )
    .expect_err("decompressed limit must fail");
    assert_eq!(decompressed_error.kind(), ErrorKind::UnsafeInput);
    assert!(decompressed_error.summary().contains("decompressed"));
}
