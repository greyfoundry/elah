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

mod common;

use std::fs;
use std::io::ErrorKind as IoErrorKind;

use common::{LevelFixture, WorldFixture};
use elah_observer::{ErrorKind, ObservationLimits, discover_world};

#[test]
fn discovers_vanilla_and_custom_dimensions_in_stable_order() {
    let fixture = WorldFixture::new();
    fixture.write_level(LevelFixture::default());
    fixture.create_region_dir("region");
    fixture.create_region_dir("DIM-1/region");
    fixture.create_region_dir("DIM1/region");
    fixture.create_region_dir("dimensions/example/moon/region");
    fixture.create_region_dir("dimensions/example/sky/islands/region");

    let world = discover_world(fixture.root(), ObservationLimits::default())
        .expect("world is discoverable");
    let ids: Vec<_> = world
        .dimensions
        .iter()
        .map(|dimension| dimension.id.as_str())
        .collect();

    assert_eq!(
        ids,
        [
            "example:moon",
            "example:sky/islands",
            "minecraft:overworld",
            "minecraft:the_end",
            "minecraft:the_nether",
        ]
    );
    assert_eq!(world.level_dat.relative_path, "level.dat");
    assert!(world.root.is_absolute());
}

#[test]
fn rejects_a_symlinked_region_file() {
    let fixture = WorldFixture::new();
    fixture.write_level(LevelFixture::default());
    let outside = fixture.write_outside_file("outside.mca", &[0; 8192]);
    if let Err(error) = fixture.symlink_file(&outside, "region/r.0.0.mca") {
        if error.kind() == IoErrorKind::PermissionDenied || error.raw_os_error() == Some(1314) {
            return;
        }
        panic!("fixture symlink should be created: {error}");
    }

    let error = discover_world(fixture.root(), ObservationLimits::default())
        .expect_err("symlink must be rejected");

    assert_eq!(error.kind(), ErrorKind::UnsafeInput);
    assert!(error.summary().contains("symbolic link"));
}

#[test]
fn rejects_a_tree_larger_than_the_path_limit() {
    let fixture = WorldFixture::new();
    fixture.write_level(LevelFixture::default());
    fixture.write_file("data/a", b"a");
    fixture.write_file("data/b", b"b");
    let limits = ObservationLimits {
        max_paths: 2,
        ..ObservationLimits::default()
    };

    let error = discover_world(fixture.root(), limits).expect_err("path cap must apply");

    assert_eq!(error.kind(), ErrorKind::UnsafeInput);
    assert!(error.summary().contains("too many paths"));
}

#[test]
fn rejects_paths_that_are_not_java_world_roots() {
    let missing = WorldFixture::new();
    let missing_error = discover_world(missing.root(), ObservationLimits::default())
        .expect_err("level.dat is required");
    assert_eq!(missing_error.kind(), ErrorKind::UnsupportedWorld);
    assert!(missing_error.summary().contains("level.dat"));

    let file_fixture = WorldFixture::new();
    let file = file_fixture.write_file("not-a-world", b"data");
    let file_error = discover_world(&file, ObservationLimits::default())
        .expect_err("world root must be a directory");
    assert_eq!(file_error.kind(), ErrorKind::UnsupportedWorld);

    fs::remove_file(file).expect("fixture file is removable");
}
