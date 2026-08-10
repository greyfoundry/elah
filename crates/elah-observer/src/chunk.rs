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

use std::fs::{self, File};
use std::io::{Cursor, Read, Seek, SeekFrom};

use flate2::read::{GzDecoder, ZlibDecoder};
use lz4_java_wrc::Lz4BlockInput;
use serde::Deserialize;

use crate::evidence::read_bounded;
use crate::{ChunkRecord, Compression, ObservationError, ObservationLimits, SafeFile};

const SECTOR_BYTES: u64 = 4096;

/// Schema-light metadata normalized from current and legacy chunk layouts.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChunkMetadata {
    /// Saved Minecraft data version, when present.
    pub data_version: Option<i32>,
    /// Embedded chunk X coordinate, when present.
    pub x_pos: Option<i32>,
    /// Embedded chunk Z coordinate, when present.
    pub z_pos: Option<i32>,
    /// Saved chunk generation status, when present.
    pub status: Option<String>,
}

#[derive(Deserialize)]
struct ChunkRoot {
    #[serde(rename = "DataVersion")]
    data_version: Option<i32>,
    #[serde(rename = "xPos")]
    x_pos: Option<i32>,
    #[serde(rename = "zPos")]
    z_pos: Option<i32>,
    #[serde(rename = "Status")]
    status: Option<String>,
    #[serde(rename = "Level")]
    level: Option<LegacyChunk>,
}

#[derive(Deserialize)]
struct LegacyChunk {
    #[serde(rename = "xPos")]
    x_pos: Option<i32>,
    #[serde(rename = "zPos")]
    z_pos: Option<i32>,
    #[serde(rename = "Status")]
    status: Option<String>,
}

/// Reads, decompresses, and parses one validated chunk record within hard limits.
pub fn decode_chunk(
    region_file: &SafeFile,
    record: &ChunkRecord,
    limits: ObservationLimits,
) -> Result<ChunkMetadata, ObservationError> {
    let compressed = if let Some(external) = &record.external_file {
        read_bounded(
            external,
            limits.max_compressed_external_chunk_bytes,
            "external chunk",
        )?
        .0
    } else {
        read_internal_chunk(region_file, record)?
    };
    let decoded = decompress_chunk(region_file, record, &compressed, limits)?;
    let root: ChunkRoot = fastnbt::from_bytes(&decoded).map_err(|error| {
        malformed_chunk(
            region_file,
            record,
            format!("NBT could not be decoded: {error}"),
        )
    })?;
    let legacy = root.level.unwrap_or(LegacyChunk {
        x_pos: None,
        z_pos: None,
        status: None,
    });
    let metadata = ChunkMetadata {
        data_version: root.data_version,
        x_pos: root.x_pos.or(legacy.x_pos),
        z_pos: root.z_pos.or(legacy.z_pos),
        status: root.status.or(legacy.status),
    };
    validate_coordinates(region_file, record, &metadata)?;
    Ok(metadata)
}

fn read_internal_chunk(
    region_file: &SafeFile,
    record: &ChunkRecord,
) -> Result<Vec<u8>, ObservationError> {
    let metadata = fs::symlink_metadata(&region_file.absolute_path).map_err(|error| {
        ObservationError::io(
            "A terrain region could not be read for deep validation.",
            "Check permissions or observe a filesystem snapshot, then try again.",
            format!("{}: {error}", region_file.absolute_path.display()),
        )
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(ObservationError::unsafe_input(
            "A terrain region is no longer a safe regular file.",
            "Stop the server or observe a filesystem snapshot, then try again.",
            region_file.absolute_path.display().to_string(),
        ));
    }
    let canonical = fs::canonicalize(&region_file.absolute_path).map_err(|error| {
        ObservationError::io(
            "A terrain region could not be resolved safely.",
            "Check permissions or observe a filesystem snapshot, then try again.",
            format!("{}: {error}", region_file.absolute_path.display()),
        )
    })?;
    if canonical != region_file.absolute_path {
        return Err(ObservationError::unsafe_input(
            "A terrain region changed its filesystem identity.",
            "Stop the server or observe a filesystem snapshot, then try again.",
            format!(
                "{} resolved as {}",
                region_file.absolute_path.display(),
                canonical.display()
            ),
        ));
    }
    let payload_length = record
        .encoded_length
        .checked_sub(1)
        .ok_or_else(|| malformed_chunk(region_file, record, "chunk payload length underflowed"))?;
    let start = u64::from(record.sector_offset)
        .checked_mul(SECTOR_BYTES)
        .and_then(|value| value.checked_add(5))
        .ok_or_else(|| malformed_chunk(region_file, record, "chunk payload offset overflowed"))?;
    let end = start
        .checked_add(u64::from(payload_length))
        .ok_or_else(|| {
            malformed_chunk(region_file, record, "chunk payload end offset overflowed")
        })?;
    if end > metadata.len() {
        return Err(malformed_chunk(
            region_file,
            record,
            format!(
                "chunk payload ends at {end}, beyond file length {}",
                metadata.len()
            ),
        ));
    }
    let mut file = File::open(&region_file.absolute_path).map_err(|error| {
        ObservationError::io(
            "A terrain region could not be opened read-only for deep validation.",
            "Check read permissions or observe a filesystem snapshot, then try again.",
            format!("{}: {error}", region_file.absolute_path.display()),
        )
    })?;
    file.seek(SeekFrom::Start(start)).map_err(|error| {
        malformed_chunk(region_file, record, format!("payload seek failed: {error}"))
    })?;
    let mut bytes = vec![0_u8; payload_length as usize];
    file.read_exact(&mut bytes).map_err(|error| {
        malformed_chunk(
            region_file,
            record,
            format!("payload is truncated: {error}"),
        )
    })?;
    Ok(bytes)
}

fn decompress_chunk(
    region_file: &SafeFile,
    record: &ChunkRecord,
    compressed: &[u8],
    limits: ObservationLimits,
) -> Result<Vec<u8>, ObservationError> {
    let reader: Box<dyn Read> = match record.compression {
        Compression::Gzip => Box::new(GzDecoder::new(Cursor::new(compressed))),
        Compression::Zlib => Box::new(ZlibDecoder::new(Cursor::new(compressed))),
        Compression::Uncompressed => Box::new(Cursor::new(compressed)),
        Compression::Lz4 => Box::new(Lz4BlockInput::new(Cursor::new(compressed))),
    };
    let sentinel = limits.max_decompressed_chunk_bytes as u64 + 1;
    let mut decoded = Vec::new();
    reader
        .take(sentinel)
        .read_to_end(&mut decoded)
        .map_err(|error| {
            malformed_chunk(
                region_file,
                record,
                format!("compressed payload could not be decoded: {error}"),
            )
        })?;
    if decoded.len() > limits.max_decompressed_chunk_bytes {
        return Err(ObservationError::unsafe_input(
            "A decompressed chunk exceeds the safe validation limit.",
            "Observe a smaller or known-good filesystem snapshot, then try again.",
            format!(
                "{} chunk {},{} exceeded {} bytes",
                region_file.relative_path,
                record.coordinate.x,
                record.coordinate.z,
                limits.max_decompressed_chunk_bytes
            ),
        ));
    }
    Ok(decoded)
}

fn validate_coordinates(
    region_file: &SafeFile,
    record: &ChunkRecord,
    metadata: &ChunkMetadata,
) -> Result<(), ObservationError> {
    let matches_x = metadata
        .x_pos
        .is_none_or(|value| i64::from(value) == record.coordinate.x);
    let matches_z = metadata
        .z_pos
        .is_none_or(|value| i64::from(value) == record.coordinate.z);
    if matches_x && matches_z {
        return Ok(());
    }
    Err(ObservationError::malformed_input(
        "A chunk's embedded coordinates do not match its Anvil location.",
        "Restore the affected region from a known-good backup or filesystem snapshot, then try again.",
        format!(
            "{} expected {},{} but NBT contained {:?},{:?}",
            region_file.relative_path,
            record.coordinate.x,
            record.coordinate.z,
            metadata.x_pos,
            metadata.z_pos
        ),
    ))
}

fn malformed_chunk(
    region_file: &SafeFile,
    record: &ChunkRecord,
    detail: impl Into<String>,
) -> ObservationError {
    ObservationError::malformed_input(
        "A terrain chunk payload is malformed.",
        "Restore the affected region from a known-good backup or filesystem snapshot, then try again.",
        format!(
            "{} chunk {},{}: {}",
            region_file.relative_path,
            record.coordinate.x,
            record.coordinate.z,
            detail.into()
        ),
    )
}
