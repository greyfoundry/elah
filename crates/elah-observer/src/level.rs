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

use std::io::Read;

use flate2::read::GzDecoder;
use serde::Deserialize;

use crate::evidence::read_bounded;
use crate::{InputEvidence, ObservationError, ObservationLimits, SafeFile};

/// Saved world metadata extracted without interpreting gameplay state.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LevelMetadata {
    /// Saved level name, when present.
    pub level_name: Option<String>,
    /// Saved Minecraft data version, when present.
    pub data_version: Option<i32>,
    /// Saved Minecraft version name, when present.
    pub version_name: Option<String>,
    /// Saved `LastPlayed` value in Unix epoch milliseconds, when present.
    pub last_played_millis: Option<i64>,
}

#[derive(Deserialize)]
struct LevelRoot {
    #[serde(rename = "Data")]
    data: LevelData,
}

#[derive(Default, Deserialize)]
struct LevelData {
    #[serde(rename = "LevelName")]
    level_name: Option<String>,
    #[serde(rename = "DataVersion")]
    data_version: Option<i32>,
    #[serde(rename = "Version")]
    version: Option<LevelVersion>,
    #[serde(rename = "LastPlayed")]
    last_played_millis: Option<i64>,
}

#[derive(Deserialize)]
struct LevelVersion {
    #[serde(rename = "Name")]
    name: Option<String>,
}

/// Reads and parses a bounded GZip NBT `level.dat` input.
pub fn read_level(
    level_dat: &SafeFile,
    limits: ObservationLimits,
) -> Result<(LevelMetadata, InputEvidence), ObservationError> {
    let (compressed, evidence) =
        read_bounded(level_dat, limits.max_compressed_level_bytes, "level.dat")?;
    let decoder = GzDecoder::new(compressed.as_slice());
    let mut decompressed = Vec::new();
    decoder
        .take(limits.max_decompressed_level_bytes as u64 + 1)
        .read_to_end(&mut decompressed)
        .map_err(|error| {
            ObservationError::malformed_input(
                "The level.dat file is not valid GZip-compressed world metadata.",
                "Use a known-good world backup or filesystem snapshot, then try again.",
                error.to_string(),
            )
        })?;
    if decompressed.len() > limits.max_decompressed_level_bytes {
        return Err(ObservationError::unsafe_input(
            "The decompressed level.dat file exceeds the safe read limit.",
            "Use a known-good world backup or smaller filesystem snapshot, then try again.",
            format!(
                "more than {} bytes were decompressed",
                limits.max_decompressed_level_bytes
            ),
        ));
    }

    let root: LevelRoot = fastnbt::from_bytes(&decompressed).map_err(|error| {
        ObservationError::malformed_input(
            "The level.dat file does not contain valid Java world NBT metadata.",
            "Use a known-good world backup or filesystem snapshot, then try again.",
            error.to_string(),
        )
    })?;
    Ok((
        LevelMetadata {
            level_name: root.data.level_name,
            data_version: root.data.data_version,
            version_name: root.data.version.and_then(|version| version.name),
            last_played_millis: root.data.last_played_millis,
        },
        evidence,
    ))
}
