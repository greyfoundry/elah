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
use flate2::write::{GzEncoder, ZlibEncoder};
use lz4_java_wrc::Lz4BlockOutput;
use serde::Serialize;
use tempfile::TempDir;

const SECTOR_BYTES: usize = 4096;

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

pub struct RegionFixture {
    bytes: Vec<u8>,
    next_sector: u32,
}

#[derive(Clone, Debug)]
pub struct ChunkFixture {
    pub data_version: Option<i32>,
    pub x_pos: Option<i32>,
    pub z_pos: Option<i32>,
    pub status: Option<String>,
    pub legacy_level: bool,
}

impl ChunkFixture {
    pub fn at(x_pos: i32, z_pos: i32) -> Self {
        Self {
            data_version: Some(4440),
            x_pos: Some(x_pos),
            z_pos: Some(z_pos),
            status: Some("minecraft:full".to_owned()),
            legacy_level: false,
        }
    }

    pub fn nbt_bytes(&self) -> Vec<u8> {
        let fields = ChunkFields {
            x_pos: self.x_pos,
            z_pos: self.z_pos,
            status: self.status.as_deref(),
        };
        fastnbt::to_bytes(&ChunkRoot {
            data_version: self.data_version,
            x_pos: if self.legacy_level {
                None
            } else {
                fields.x_pos
            },
            z_pos: if self.legacy_level {
                None
            } else {
                fields.z_pos
            },
            status: if self.legacy_level {
                None
            } else {
                fields.status
            },
            level: self.legacy_level.then_some(fields),
        })
        .expect("fixture chunk NBT serializes")
    }
}

#[derive(Clone, Copy, Serialize)]
struct ChunkRoot<'a> {
    #[serde(rename = "DataVersion", skip_serializing_if = "Option::is_none")]
    data_version: Option<i32>,
    #[serde(rename = "xPos", skip_serializing_if = "Option::is_none")]
    x_pos: Option<i32>,
    #[serde(rename = "zPos", skip_serializing_if = "Option::is_none")]
    z_pos: Option<i32>,
    #[serde(rename = "Status", skip_serializing_if = "Option::is_none")]
    status: Option<&'a str>,
    #[serde(rename = "Level", skip_serializing_if = "Option::is_none")]
    level: Option<ChunkFields<'a>>,
}

#[derive(Clone, Copy, Serialize)]
struct ChunkFields<'a> {
    #[serde(rename = "xPos", skip_serializing_if = "Option::is_none")]
    x_pos: Option<i32>,
    #[serde(rename = "zPos", skip_serializing_if = "Option::is_none")]
    z_pos: Option<i32>,
    #[serde(rename = "Status", skip_serializing_if = "Option::is_none")]
    status: Option<&'a str>,
}

pub fn compress_chunk(compression: u8, nbt: &[u8]) -> Vec<u8> {
    match compression {
        1 => {
            let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
            encoder.write_all(nbt).expect("fixture GZip writes");
            encoder.finish().expect("fixture GZip finishes")
        }
        2 => {
            let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
            encoder.write_all(nbt).expect("fixture Zlib writes");
            encoder.finish().expect("fixture Zlib finishes")
        }
        3 => nbt.to_vec(),
        4 => {
            let mut compressed = Vec::new();
            {
                let mut encoder = Lz4BlockOutput::new(&mut compressed);
                encoder.write_all(nbt).expect("fixture LZ4 writes");
                encoder.flush().expect("fixture LZ4 flushes");
            }
            compressed
        }
        _ => panic!("unsupported fixture compression {compression}"),
    }
}

impl RegionFixture {
    pub fn new() -> Self {
        Self {
            bytes: vec![0; SECTOR_BYTES * 2],
            next_sector: 2,
        }
    }

    pub fn add_chunk(
        &mut self,
        local_x: u8,
        local_z: u8,
        timestamp_seconds: u32,
        compression: u8,
        payload: &[u8],
    ) {
        assert!(local_x < 32 && local_z < 32);
        let length = 1_usize + payload.len();
        let required = 4_usize + length;
        let sectors = required.div_ceil(SECTOR_BYTES);
        assert!((1..=255).contains(&sectors));
        let offset = self.next_sector;
        self.set_location(local_x, local_z, offset, sectors as u8);
        self.set_timestamp(local_x, local_z, timestamp_seconds);

        let start = offset as usize * SECTOR_BYTES;
        self.bytes.resize(start + sectors * SECTOR_BYTES, 0);
        self.bytes[start..start + 4].copy_from_slice(&(length as u32).to_be_bytes());
        self.bytes[start + 4] = compression;
        self.bytes[start + 5..start + 5 + payload.len()].copy_from_slice(payload);
        self.next_sector += sectors as u32;
    }

    pub fn set_location(&mut self, local_x: u8, local_z: u8, sector_offset: u32, sector_count: u8) {
        assert!(sector_offset <= 0x00ff_ffff);
        let index = usize::from(local_x) + usize::from(local_z) * 32;
        let position = index * 4;
        let encoded = sector_offset.to_be_bytes();
        self.bytes[position..position + 3].copy_from_slice(&encoded[1..4]);
        self.bytes[position + 3] = sector_count;
    }

    pub fn set_timestamp(&mut self, local_x: u8, local_z: u8, timestamp_seconds: u32) {
        let index = usize::from(local_x) + usize::from(local_z) * 32;
        let position = SECTOR_BYTES + index * 4;
        self.bytes[position..position + 4].copy_from_slice(&timestamp_seconds.to_be_bytes());
    }

    pub fn ensure_sector_count(&mut self, sector_count: usize) {
        self.bytes.resize(sector_count * SECTOR_BYTES, 0);
    }

    pub fn set_envelope(&mut self, sector_offset: u32, length: u32, compression: u8) {
        let start = sector_offset as usize * SECTOR_BYTES;
        self.bytes.resize(start + 5, 0);
        self.bytes[start..start + 4].copy_from_slice(&length.to_be_bytes());
        self.bytes[start + 4] = compression;
    }

    pub fn truncate(&mut self, length: usize) {
        self.bytes.truncate(length);
    }

    pub fn into_bytes(self) -> Vec<u8> {
        self.bytes
    }
}
