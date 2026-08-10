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

use std::fs::{self, File, FileTimes};
use std::io::Write;
use std::path::Path;
use std::process::{Command, Output};

use elah_cli::run_with;
use elah_observer::{ObservationEvent, ObserveRequest, observe};
use flate2::Compression;
use flate2::write::GzEncoder;
use serde::Serialize;
use tempfile::TempDir;

#[derive(Serialize)]
struct LevelRoot<'a> {
    #[serde(rename = "Data")]
    data: LevelData<'a>,
}

#[derive(Serialize)]
struct LevelData<'a> {
    #[serde(rename = "LevelName")]
    level_name: &'a str,
    #[serde(rename = "DataVersion")]
    data_version: i32,
    #[serde(rename = "LastPlayed")]
    last_played: i64,
}

fn fixture_world() -> TempDir {
    let world = TempDir::new().expect("temporary world is created");
    fs::create_dir(world.path().join("region")).expect("region directory is created");
    let nbt = fastnbt::to_bytes(&LevelRoot {
        data: LevelData {
            level_name: "CLI Fixture",
            data_version: 4440,
            last_played: 1_700_000_000_000,
        },
    })
    .expect("level NBT serializes");
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(&nbt).expect("level GZip writes");
    fs::write(
        world.path().join("level.dat"),
        encoder.finish().expect("level GZip finishes"),
    )
    .expect("level.dat is written");
    fs::write(world.path().join("region/r.0.0.mca"), vec![0_u8; 8192])
        .expect("empty Anvil region is written");
    world
}

fn run(world: &Path, extra: &[&str]) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_elah"));
    command.arg("observe").arg(world);
    command.args(extra);
    command.output().expect("elah runs")
}

fn write_one_chunk_region(world: &Path) -> usize {
    #[derive(Serialize)]
    struct Chunk {
        #[serde(rename = "DataVersion")]
        data_version: i32,
        #[serde(rename = "xPos")]
        x_pos: i32,
        #[serde(rename = "zPos")]
        z_pos: i32,
        #[serde(rename = "Status")]
        status: &'static str,
    }

    let nbt = fastnbt::to_bytes(&Chunk {
        data_version: 4440,
        x_pos: 0,
        z_pos: 0,
        status: "minecraft:full",
    })
    .expect("chunk NBT serializes");
    let mut region = vec![0_u8; 12_288];
    region[0..4].copy_from_slice(&[0, 0, 2, 1]);
    region[4096..4100].copy_from_slice(&1_u32.to_be_bytes());
    region[8192..8196].copy_from_slice(&((nbt.len() + 1) as u32).to_be_bytes());
    region[8196] = 3;
    region[8197..8197 + nbt.len()].copy_from_slice(&nbt);
    fs::write(world.join("region/r.0.0.mca"), region).expect("Anvil region is written");
    nbt.len()
}

#[test]
fn human_observation_is_readable_and_complete() {
    let world = fixture_world();
    let output = run(world.path(), &[]);
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("stdout is UTF-8");

    assert!(stdout.contains("Elah World Observation"));
    assert!(stdout.contains("CLI Fixture"));
    assert!(stdout.contains("Scan depth: standard"));
    assert!(stdout.contains("Logical bytes:"));
    assert!(stdout.contains("minecraft:overworld"));
    assert!(stdout.contains("Limitations"));
    assert!(!stdout.contains("WorldReport {"));
}

#[test]
fn json_success_is_one_schema_document_and_notices_stay_on_stderr() {
    let world = fixture_world();
    let output = run(world.path(), &["--format", "json"]);
    assert!(output.status.success());
    let report: serde_json::Value = serde_json::from_slice(&output.stdout).expect("JSON parses");
    assert_eq!(report["schema"], "elah.observe/v1");
    assert_eq!(report["scan"]["depth"], "standard");
    let stderr = String::from_utf8(output.stderr).expect("stderr is UTF-8");
    assert!(stderr.contains("Standard scan complete"));
    assert!(stderr.contains("Verifying"));
}

#[test]
fn actionable_failure_hides_technical_details_until_verbose() {
    let missing = Path::new("definitely-not-an-elah-world");
    let default = run(missing, &[]);
    assert_eq!(default.status.code(), Some(3));
    assert!(default.stdout.is_empty());
    let stderr = String::from_utf8(default.stderr).expect("stderr is UTF-8");
    assert!(stderr.contains("Observation failed:"));
    assert!(stderr.contains("No report was produced"));
    assert!(stderr.contains("Recovery:"));
    assert!(stderr.contains("--verbose"));
    assert!(!stderr.contains("definitely-not-an-elah-world:"));
    assert!(!stderr.contains("backtrace"));

    let verbose = run(missing, &["--verbose"]);
    assert_eq!(verbose.status.code(), Some(3));
    let stderr = String::from_utf8(verbose.stderr).expect("stderr is UTF-8");
    assert!(stderr.contains("Technical details:"));
    assert!(stderr.contains("definitely-not-an-elah-world"));
}

#[test]
fn json_failure_is_versioned_and_never_masquerades_as_success() {
    let output = run(
        Path::new("definitely-not-an-elah-world"),
        &["--format", "json"],
    );
    assert_eq!(output.status.code(), Some(3));
    assert!(output.stdout.is_empty());
    let error: serde_json::Value =
        serde_json::from_slice(&output.stderr).expect("error JSON parses");
    assert_eq!(error["schema"], "elah.error/v1");
    assert_eq!(error["kind"], "unsupported_world");
    assert!(
        error["details"]
            .as_array()
            .expect("details is an array")
            .is_empty()
    );
}

#[test]
fn changed_world_returns_five_without_a_partial_report() {
    let world = fixture_world();
    let nbt_length = write_one_chunk_region(world.path());
    let region_path = world.path().join("region/r.0.0.mca");
    let original_modified = fs::metadata(&region_path)
        .expect("region metadata is readable")
        .modified()
        .expect("region modification time is available");
    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let mut mutated = false;
    let world_argument = world.path().as_os_str().to_owned();

    let code = run_with(
        [
            std::ffi::OsString::from("elah"),
            std::ffi::OsString::from("observe"),
            world_argument,
            std::ffi::OsString::from("--deep"),
            std::ffi::OsString::from("--verbose"),
        ],
        &mut stdout,
        &mut stderr,
        |request: ObserveRequest, cli_event: &mut dyn FnMut(&ObservationEvent)| {
            observe(request, |event| {
                cli_event(event);
                if matches!(event, ObservationEvent::VerifyingConsistency) && !mutated {
                    let mut bytes = fs::read(&region_path).expect("region is readable");
                    bytes[8197 + nbt_length - 1] ^= 1;
                    fs::write(&region_path, bytes).expect("test mutates its fixture");
                    File::options()
                        .write(true)
                        .open(&region_path)
                        .expect("region can restore its modification time")
                        .set_times(FileTimes::new().set_modified(original_modified))
                        .expect("region modification time is restored");
                    mutated = true;
                }
            })
        },
    );

    assert_eq!(code, 5);
    assert!(stdout.is_empty());
    let stderr = String::from_utf8(stderr).expect("stderr is UTF-8");
    assert!(stderr.contains("world changed"));
    assert!(stderr.contains("No report was produced"));
    assert!(stderr.contains("Technical details:"));
    assert!(stderr.contains("r.0.0.mca"));
}

#[test]
fn help_explains_deep_cost_and_verbose_details() {
    let output = Command::new(env!("CARGO_BIN_EXE_elah"))
        .args(["observe", "--help"])
        .output()
        .expect("help runs");
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("stdout is UTF-8");
    assert!(stdout.contains("costs more I/O, CPU, and time"));
    assert!(stdout.contains("technical evidence"));
}
