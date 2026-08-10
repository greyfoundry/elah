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

#![allow(dead_code)]

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use flate2::Compression;
use flate2::write::GzEncoder;
use serde::Serialize;
use tempfile::TempDir;

#[derive(Clone, Debug)]
pub struct LevelFixture {
    pub level_name: Option<String>,
    pub data_version: Option<i32>,
    pub version_name: Option<String>,
    pub include_empty_version: bool,
    pub last_played_millis: Option<i64>,
}

impl Default for LevelFixture {
    fn default() -> Self {
        Self {
            level_name: Some("Observer Fixture".to_owned()),
            data_version: Some(4440),
            version_name: Some("fixture-version".to_owned()),
            include_empty_version: false,
            last_played_millis: Some(1_700_000_000_000),
        }
    }
}

#[derive(Serialize)]
struct LevelRoot<'a> {
    #[serde(rename = "Data")]
    data: LevelData<'a>,
}

#[derive(Serialize)]
struct LevelData<'a> {
    #[serde(rename = "LevelName", skip_serializing_if = "Option::is_none")]
    level_name: Option<&'a str>,
    #[serde(rename = "DataVersion", skip_serializing_if = "Option::is_none")]
    data_version: Option<i32>,
    #[serde(rename = "Version", skip_serializing_if = "Option::is_none")]
    version: Option<LevelVersion<'a>>,
    #[serde(rename = "LastPlayed", skip_serializing_if = "Option::is_none")]
    last_played_millis: Option<i64>,
}

#[derive(Serialize)]
struct LevelVersion<'a> {
    #[serde(rename = "Name", skip_serializing_if = "Option::is_none")]
    name: Option<&'a str>,
}

pub struct WorldFixture {
    root: TempDir,
    outside: TempDir,
}

impl WorldFixture {
    pub fn new() -> Self {
        Self {
            root: tempfile::tempdir().expect("world fixture directory is created"),
            outside: tempfile::tempdir().expect("outside fixture directory is created"),
        }
    }

    pub fn root(&self) -> &Path {
        self.root.path()
    }

    pub fn path(&self, relative: impl AsRef<Path>) -> PathBuf {
        self.root.path().join(relative)
    }

    pub fn write_level(&self, fixture: LevelFixture) -> Vec<u8> {
        let root = LevelRoot {
            data: LevelData {
                level_name: fixture.level_name.as_deref(),
                data_version: fixture.data_version,
                version: (fixture.version_name.is_some() || fixture.include_empty_version)
                    .then_some(LevelVersion {
                        name: fixture.version_name.as_deref(),
                    }),
                last_played_millis: fixture.last_played_millis,
            },
        };
        let nbt = fastnbt::to_bytes(&root).expect("fixture NBT serializes");
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(&nbt).expect("fixture NBT compresses");
        let compressed = encoder.finish().expect("fixture GZip completes");
        self.write_file("level.dat", &compressed);
        compressed
    }

    pub fn create_region_dir(&self, relative: impl AsRef<Path>) {
        fs::create_dir_all(self.path(relative)).expect("fixture region directory is created");
    }

    pub fn write_file(&self, relative: impl AsRef<Path>, bytes: &[u8]) -> PathBuf {
        let path = self.path(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("fixture parent directory is created");
        }
        fs::write(&path, bytes).expect("fixture file is written");
        path
    }

    pub fn write_outside_file(&self, name: &str, bytes: &[u8]) -> PathBuf {
        let path = self.outside.path().join(name);
        fs::write(&path, bytes).expect("outside fixture file is written");
        path
    }

    pub fn symlink_file(&self, source: &Path, relative_target: &str) -> io::Result<()> {
        let target = self.path(relative_target);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }

        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(source, target)
        }

        #[cfg(windows)]
        {
            std::os::windows::fs::symlink_file(source, target)
        }
    }
}
