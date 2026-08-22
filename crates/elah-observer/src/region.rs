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

use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::time::SystemTime;

use crate::evidence::sha256_hex;
use crate::{ObservationError, ObservationLimits, SafeFile};

const SECTOR_BYTES: u64 = 4096;
const HEADER_BYTES: usize = 8192;
const LOCATION_ENTRIES: usize = 1024;

/// Coordinates encoded by an Anvil region filename.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RegionCoordinate {
    /// Region X coordinate.
    pub x: i32,
    /// Region Z coordinate.
    pub z: i32,
}

/// Absolute chunk coordinates derived from a region entry.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd)]
pub struct ChunkCoordinate {
    /// Chunk X coordinate.
    pub x: i64,
    /// Chunk Z coordinate.
    pub z: i64,
}

/// Compression identifier stored in an Anvil chunk envelope.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Compression {
    /// GZip-compressed NBT.
    Gzip,
    /// Zlib-compressed NBT.
    Zlib,
    /// Uncompressed NBT.
    Uncompressed,
    /// Java LZ4-block-compressed NBT.
    Lz4,
}

/// Structurally validated occupied chunk record.
#[derive(Clone, Debug, PartialEq)]
pub struct ChunkRecord {
    /// Local X coordinate within the region.
    pub local_x: u8,
    /// Local Z coordinate within the region.
    pub local_z: u8,
    /// Absolute chunk coordinate.
    pub coordinate: ChunkCoordinate,
    /// First allocated sector.
    pub sector_offset: u32,
    /// Allocated sector count.
    pub sector_count: u8,
    /// Length field including the compression byte.
    pub encoded_length: u32,
    /// Compression scheme.
    pub compression: Compression,
    /// Whether compressed bytes live in an external `.mcc` sidecar.
    pub external: bool,
    /// Saved Anvil header timestamp in Unix epoch seconds.
    pub timestamp_seconds: u32,
    /// Validated external sidecar, when used.
    pub external_file: Option<SafeFile>,
}

/// Standard-mode evidence over report-driving region bytes.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RegionEvidence {
    /// Last modification time observed before scanning, when supported.
    pub modified: Option<SystemTime>,
    /// SHA-256 of the complete 8 KiB header.
    pub header_sha256: String,
    /// SHA-256 of occupied five-byte envelopes in header entry order.
    pub envelopes_sha256: String,
}

/// Complete standard structural result for one terrain region.
#[derive(Clone, Debug, PartialEq)]
pub struct RegionScan {
    /// Dimension containing the region.
    pub dimension_id: String,
    /// Safe discovered region file.
    pub source: SafeFile,
    /// Filename coordinates.
    pub coordinate: RegionCoordinate,
    /// Logical region bytes.
    pub logical_bytes: u64,
    /// Sorted occupied chunks.
    pub chunks: Vec<ChunkRecord>,
    /// Latest nonzero header timestamp.
    pub latest_timestamp_seconds: Option<u64>,
    /// Standard evidence required by the consistency pass.
    pub evidence: RegionEvidence,
}

#[derive(Clone, Copy, Debug)]
struct Location {
    local_x: u8,
    local_z: u8,
    sector_offset: u32,
    sector_count: u8,
    timestamp_seconds: u32,
}

/// Reads every Anvil location/timestamp entry and occupied record envelope.
pub fn scan_region_standard(
    root: &Path,
    region_file: &SafeFile,
    dimension_id: &str,
    _limits: ObservationLimits,
) -> Result<RegionScan, ObservationError> {
    let coordinate = parse_region_coordinate(&region_file.absolute_path)?;
    let (mut file, metadata) = open_region_read_only(region_file)?;
    if metadata.len() < HEADER_BYTES as u64 {
        return Err(malformed_region(
            region_file,
            format!(
                "file is {} bytes; Anvil header requires {HEADER_BYTES}",
                metadata.len()
            ),
        ));
    }
    if metadata.len() % SECTOR_BYTES != 0 {
        return Err(malformed_region(
            region_file,
            format!(
                "file length {} is not sector-aligned to {SECTOR_BYTES} bytes",
                metadata.len()
            ),
        ));
    }

    let mut header = [0_u8; HEADER_BYTES];
    file.read_exact(&mut header).map_err(|error| {
        malformed_region(region_file, format!("header could not be read: {error}"))
    })?;
    let locations = parse_locations(region_file, &header, metadata.len())?;
    reject_overlaps(region_file, &locations)?;

    let mut chunks = Vec::with_capacity(locations.len());
    let mut envelope_bytes = Vec::with_capacity(locations.len() * 5);
    for location in locations {
        let start = u64::from(location.sector_offset)
            .checked_mul(SECTOR_BYTES)
            .ok_or_else(|| malformed_region(region_file, "sector byte offset overflowed"))?;
        file.seek(SeekFrom::Start(start)).map_err(|error| {
            malformed_region(region_file, format!("chunk envelope seek failed: {error}"))
        })?;
        let mut envelope = [0_u8; 5];
        file.read_exact(&mut envelope).map_err(|error| {
            malformed_region(region_file, format!("chunk envelope is truncated: {error}"))
        })?;
        envelope_bytes.extend_from_slice(&envelope);

        let encoded_length = u32::from_be_bytes(envelope[0..4].try_into().expect("four bytes"));
        if encoded_length == 0 {
            return Err(malformed_region(region_file, "chunk length is zero"));
        }
        let allocated_bytes = u64::from(location.sector_count) * SECTOR_BYTES;
        let record_bytes = u64::from(encoded_length)
            .checked_add(4)
            .ok_or_else(|| malformed_region(region_file, "chunk record length overflowed"))?;
        if record_bytes > allocated_bytes {
            return Err(malformed_region(
                region_file,
                format!(
                    "chunk record requires {record_bytes} bytes but allocation contains {allocated_bytes}"
                ),
            ));
        }

        let external = envelope[4] & 0x80 != 0;
        let compression = match envelope[4] & 0x7f {
            1 => Compression::Gzip,
            2 => Compression::Zlib,
            3 => Compression::Uncompressed,
            4 => Compression::Lz4,
            value => {
                return Err(malformed_region(
                    region_file,
                    format!("unknown chunk compression identifier {value}"),
                ));
            }
        };
        if external && encoded_length != 1 {
            return Err(malformed_region(
                region_file,
                format!("external chunk length must be 1, found {encoded_length}"),
            ));
        }

        let coordinate = chunk_coordinate(coordinate, location.local_x, location.local_z)?;
        let external_file = if external {
            Some(discover_external_file(root, region_file, coordinate)?)
        } else {
            None
        };
        chunks.push(ChunkRecord {
            local_x: location.local_x,
            local_z: location.local_z,
            coordinate,
            sector_offset: location.sector_offset,
            sector_count: location.sector_count,
            encoded_length,
            compression,
            external,
            timestamp_seconds: location.timestamp_seconds,
            external_file,
        });
    }

    chunks.sort_by_key(|chunk| chunk.coordinate);
    let latest_timestamp_seconds = chunks
        .iter()
        .map(|chunk| u64::from(chunk.timestamp_seconds))
        .filter(|timestamp| *timestamp != 0)
        .max();
    Ok(RegionScan {
        dimension_id: dimension_id.to_owned(),
        source: region_file.clone(),
        coordinate,
        logical_bytes: metadata.len(),
        chunks,
        latest_timestamp_seconds,
        evidence: RegionEvidence {
            modified: metadata.modified().ok(),
            header_sha256: sha256_hex(&header),
            envelopes_sha256: sha256_hex(&envelope_bytes),
        },
    })
}

fn parse_region_coordinate(path: &Path) -> Result<RegionCoordinate, ObservationError> {
    let name = path.file_name().and_then(|value| value.to_str()).ok_or_else(|| {
        ObservationError::malformed_input(
            "A region filename is not valid Unicode.",
            "Rename the file in a copy of the world or use a known-good snapshot, then try again.",
            path.display().to_string(),
        )
    })?;
    if name.ends_with(".mcr") {
        return Err(ObservationError::unsupported_world(
            "The selected world contains a legacy McRegion file that Observer does not support.",
            "Convert the world with a compatible Minecraft version or observe an Anvil `.mca` snapshot, then try again.",
            path.display().to_string(),
        ));
    }
    let parts: Vec<_> = name.split('.').collect();
    if parts.len() != 4 || parts[0] != "r" || parts[3] != "mca" {
        return Err(ObservationError::malformed_input(
            "A terrain region filename does not match r.<x>.<z>.mca.",
            "Rename the file in a copy of the world or use a known-good snapshot, then try again.",
            path.display().to_string(),
        ));
    }
    let x = parts[1].parse::<i32>().map_err(|error| {
        ObservationError::malformed_input(
            "A terrain region X coordinate is invalid.",
            "Use a known-good world snapshot, then try again.",
            format!("{}: {error}", path.display()),
        )
    })?;
    let z = parts[2].parse::<i32>().map_err(|error| {
        ObservationError::malformed_input(
            "A terrain region Z coordinate is invalid.",
            "Use a known-good world snapshot, then try again.",
            format!("{}: {error}", path.display()),
        )
    })?;
    Ok(RegionCoordinate { x, z })
}

fn open_region_read_only(region_file: &SafeFile) -> Result<(File, fs::Metadata), ObservationError> {
    let metadata = fs::symlink_metadata(&region_file.absolute_path).map_err(|error| {
        ObservationError::io(
            "A terrain region could not be read.",
            "Check permissions or observe a filesystem snapshot, then try again.",
            format!("{}: {error}", region_file.absolute_path.display()),
        )
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(ObservationError::unsafe_input(
            "A terrain region is no longer a safe regular file.",
            "Stop the server or observe a self-contained filesystem snapshot, then try again.",
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
    let file = File::open(&region_file.absolute_path).map_err(|error| {
        ObservationError::io(
            "A terrain region could not be opened read-only.",
            "Check read permissions or observe a filesystem snapshot, then try again.",
            format!("{}: {error}", region_file.absolute_path.display()),
        )
    })?;
    Ok((file, metadata))
}

fn parse_locations(
    region_file: &SafeFile,
    header: &[u8; HEADER_BYTES],
    file_length: u64,
) -> Result<Vec<Location>, ObservationError> {
    let mut locations = Vec::new();
    for index in 0..LOCATION_ENTRIES {
        let position = index * 4;
        let sector_offset = u32::from_be_bytes([
            0,
            header[position],
            header[position + 1],
            header[position + 2],
        ]);
        let sector_count = header[position + 3];
        if sector_offset == 0 && sector_count == 0 {
            continue;
        }
        if sector_offset == 0 || sector_count == 0 {
            return Err(malformed_region(
                region_file,
                format!("location entry {index} has a partial-zero allocation"),
            ));
        }
        if sector_offset < 2 {
            return Err(malformed_region(
                region_file,
                format!("location entry {index} points into the Anvil header"),
            ));
        }
        let allocation_end = u64::from(sector_offset)
            .checked_add(u64::from(sector_count))
            .and_then(|sector| sector.checked_mul(SECTOR_BYTES))
            .ok_or_else(|| malformed_region(region_file, "sector allocation overflowed"))?;
        if allocation_end > file_length {
            return Err(malformed_region(
                region_file,
                format!(
                    "location entry {index} ends at byte {allocation_end}, beyond file length {file_length}"
                ),
            ));
        }
        let timestamp_position = 4096 + position;
        let timestamp_seconds = u32::from_be_bytes(
            header[timestamp_position..timestamp_position + 4]
                .try_into()
                .expect("four bytes"),
        );
        locations.push(Location {
            local_x: (index % 32) as u8,
            local_z: (index / 32) as u8,
            sector_offset,
            sector_count,
            timestamp_seconds,
        });
    }
    Ok(locations)
}

fn reject_overlaps(region_file: &SafeFile, locations: &[Location]) -> Result<(), ObservationError> {
    let mut ranges: Vec<_> = locations
        .iter()
        .map(|location| {
            (
                location.sector_offset,
                location.sector_offset + u32::from(location.sector_count),
            )
        })
        .collect();
    ranges.sort_unstable();
    for pair in ranges.windows(2) {
        if pair[1].0 < pair[0].1 {
            return Err(malformed_region(
                region_file,
                format!(
                    "sector allocations {}..{} and {}..{} overlap",
                    pair[0].0, pair[0].1, pair[1].0, pair[1].1
                ),
            ));
        }
    }
    Ok(())
}

fn chunk_coordinate(
    region: RegionCoordinate,
    local_x: u8,
    local_z: u8,
) -> Result<ChunkCoordinate, ObservationError> {
    let x = i64::from(region.x)
        .checked_mul(32)
        .and_then(|value| value.checked_add(i64::from(local_x)))
        .ok_or_else(|| {
            ObservationError::malformed_input(
                "A chunk X coordinate exceeds the supported range.",
                "Use a known-good world snapshot, then try again.",
                format!("region {}, local {local_x}", region.x),
            )
        })?;
    let z = i64::from(region.z)
        .checked_mul(32)
        .and_then(|value| value.checked_add(i64::from(local_z)))
        .ok_or_else(|| {
            ObservationError::malformed_input(
                "A chunk Z coordinate exceeds the supported range.",
                "Use a known-good world snapshot, then try again.",
                format!("region {}, local {local_z}", region.z),
            )
        })?;
    Ok(ChunkCoordinate { x, z })
}

fn discover_external_file(
    root: &Path,
    region_file: &SafeFile,
    coordinate: ChunkCoordinate,
) -> Result<SafeFile, ObservationError> {
    let parent = region_file
        .absolute_path
        .parent()
        .ok_or_else(|| malformed_region(region_file, "region file has no parent directory"))?;
    let candidate = parent.join(format!("c.{}.{}.mcc", coordinate.x, coordinate.z));
    let metadata = fs::symlink_metadata(&candidate).map_err(|error| {
        ObservationError::malformed_input(
            "An external chunk sidecar is missing or unreadable.",
            "Restore the matching `.mcc` file from a known-good snapshot, then try again.",
            format!("{}: {error}", candidate.display()),
        )
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(ObservationError::unsafe_input(
            "An external chunk sidecar is not a safe regular file.",
            "Replace redirected sidecars with regular files inside a filesystem snapshot, then try again.",
            candidate.display().to_string(),
        ));
    }
    let canonical = fs::canonicalize(&candidate).map_err(|error| {
        ObservationError::io(
            "An external chunk sidecar could not be resolved safely.",
            "Check permissions or observe a filesystem snapshot, then try again.",
            format!("{}: {error}", candidate.display()),
        )
    })?;
    if !canonical.starts_with(root) {
        return Err(ObservationError::unsafe_input(
            "An external chunk sidecar resolves outside the selected world.",
            "Observe a self-contained filesystem snapshot, then try again.",
            canonical.display().to_string(),
        ));
    }
    let relative_path = canonical
        .strip_prefix(root)
        .expect("prefix checked")
        .to_str()
        .ok_or_else(|| {
            ObservationError::unsupported_world(
                "An external chunk sidecar path is not valid Unicode.",
                "Rename the file in a copy of the world, then try again.",
                canonical.display().to_string(),
            )
        })?
        .replace('\\', "/");
    Ok(SafeFile {
        absolute_path: canonical,
        relative_path,
        logical_bytes: metadata.len(),
        modified: metadata.modified().ok(),
    })
}

fn malformed_region(region_file: &SafeFile, detail: impl Into<String>) -> ObservationError {
    ObservationError::malformed_input(
        "A terrain region is structurally invalid.",
        "Use a known-good world backup or filesystem snapshot, then try again.",
        format!("{}: {}", region_file.relative_path, detail.into()),
    )
}
