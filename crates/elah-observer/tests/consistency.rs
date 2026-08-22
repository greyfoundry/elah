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

use common::{LevelFixture, RegionFixture, WorldFixture};
use elah_observer::{ErrorKind, ObservationEvent, ObserveRequest, ScanDepth, observe};

fn mutable_world() -> WorldFixture {
    let fixture = WorldFixture::new();
    fixture.write_level(LevelFixture::default());
    let mut region = RegionFixture::new();
    region.add_chunk(0, 0, 1_700_000_000, 2, b"chunk");
    fixture.write_file("region/r.0.0.mca", &region.into_bytes());
    fixture.write_file("data/existing", b"existing");
    fixture
}

fn assert_changed(error: &elah_observer::ObservationError) {
    assert_eq!(error.kind(), ErrorKind::Changed);
    assert_eq!(
        error.summary(),
        "The world changed while Elah was reading it, so no report was produced."
    );
    assert!(error.recovery().contains("filesystem snapshot"));
}

#[test]
fn changed_region_header_fails_closed_at_the_consistency_pass() {
    let fixture = mutable_world();
    let region_path = fixture.path("region/r.0.0.mca");
    let mut mutated = false;

    let error = observe(
        ObserveRequest::new(fixture.root(), ScanDepth::Standard),
        |event| {
            if matches!(event, ObservationEvent::VerifyingConsistency) && !mutated {
                let mut bytes = fs::read(&region_path).expect("fixture region is readable");
                bytes[4096..4100].copy_from_slice(&1_700_000_001_u32.to_be_bytes());
                fs::write(&region_path, bytes).expect("test may mutate its temporary fixture");
                mutated = true;
            }
        },
    )
    .expect_err("changed world must fail closed");

    assert_changed(&error);
    assert!(
        error
            .details()
            .iter()
            .any(|line| line.contains("r.0.0.mca"))
    );
}

#[test]
fn added_and_removed_report_inputs_fail_closed() {
    let added = mutable_world();
    let mut added_once = false;
    let added_error = observe(
        ObserveRequest::new(added.root(), ScanDepth::Standard),
        |event| {
            if matches!(event, ObservationEvent::VerifyingConsistency) && !added_once {
                added.write_file("data/added", b"added");
                added_once = true;
            }
        },
    )
    .expect_err("added input must fail closed");
    assert_changed(&added_error);
    assert!(
        added_error
            .details()
            .iter()
            .any(|line| line.contains("added"))
    );

    let removed = mutable_world();
    let removed_path = removed.path("data/existing");
    let mut removed_once = false;
    let removed_error = observe(
        ObserveRequest::new(removed.root(), ScanDepth::Standard),
        |event| {
            if matches!(event, ObservationEvent::VerifyingConsistency) && !removed_once {
                fs::remove_file(&removed_path).expect("test may remove its temporary fixture");
                removed_once = true;
            }
        },
    )
    .expect_err("removed input must fail closed");
    assert_changed(&removed_error);
    assert!(
        removed_error
            .details()
            .iter()
            .any(|line| line.contains("removed"))
    );
}

#[test]
fn changed_level_metadata_fails_closed() {
    let fixture = mutable_world();
    let mut mutated = false;
    let error = observe(
        ObserveRequest::new(fixture.root(), ScanDepth::Standard),
        |event| {
            if matches!(event, ObservationEvent::VerifyingConsistency) && !mutated {
                fixture.write_level(LevelFixture {
                    level_name: Some("Changed".to_owned()),
                    ..LevelFixture::default()
                });
                mutated = true;
            }
        },
    )
    .expect_err("changed level metadata must fail closed");

    assert_changed(&error);
    assert!(
        error
            .details()
            .iter()
            .any(|line| line.contains("level.dat"))
    );
}

#[test]
fn verbose_changed_path_evidence_is_sorted_and_bounded() {
    let fixture = mutable_world();
    let mut mutated = false;
    let error = observe(
        ObserveRequest::new(fixture.root(), ScanDepth::Standard),
        |event| {
            if matches!(event, ObservationEvent::VerifyingConsistency) && !mutated {
                for index in (0..60).rev() {
                    fixture.write_file(format!("data/change-{index:02}"), b"change");
                }
                mutated = true;
            }
        },
    )
    .expect_err("many changed paths must fail closed");

    assert_changed(&error);
    assert_eq!(error.details().len(), 50);
    assert!(error.details()[0].contains("change-00"));
    assert!(error.details()[49].contains("more changed inputs"));
}
