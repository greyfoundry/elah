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
use std::io::{Read, Take};
use std::time::SystemTime;

use sha2::{Digest, Sha256};

use crate::{ObservationError, SafeFile};

/// Fingerprint and metadata for bytes that contributed to an observation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InputEvidence {
    /// Deterministic world-relative path.
    pub relative_path: String,
    /// Logical bytes read from the file.
    pub logical_bytes: u64,
    /// Last modification time observed before the read, when supported.
    pub modified: Option<SystemTime>,
    /// Lowercase SHA-256 of the exact bytes read.
    pub sha256: String,
}

pub(crate) fn read_bounded(
    safe_file: &SafeFile,
    maximum_bytes: usize,
    subject: &str,
) -> Result<(Vec<u8>, InputEvidence), ObservationError> {
    let metadata = fs::symlink_metadata(&safe_file.absolute_path).map_err(|error| {
        ObservationError::io(
            format!("The {subject} input could not be read."),
            "Check permissions or observe a readable filesystem snapshot, then try again.",
            format!("{}: {error}", safe_file.absolute_path.display()),
        )
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(ObservationError::unsafe_input(
            format!("The {subject} input is no longer a safe regular file."),
            "Stop the server or observe a self-contained filesystem snapshot, then try again.",
            safe_file.absolute_path.display().to_string(),
        ));
    }
    let canonical = fs::canonicalize(&safe_file.absolute_path).map_err(|error| {
        ObservationError::io(
            format!("The {subject} input could not be resolved safely."),
            "Check permissions or observe a readable filesystem snapshot, then try again.",
            format!("{}: {error}", safe_file.absolute_path.display()),
        )
    })?;
    if canonical != safe_file.absolute_path {
        return Err(ObservationError::unsafe_input(
            format!("The {subject} input changed its filesystem identity."),
            "Stop the server or observe a filesystem snapshot, then try again.",
            format!(
                "{} resolved as {}",
                safe_file.absolute_path.display(),
                canonical.display()
            ),
        ));
    }
    if metadata.len() > maximum_bytes as u64 {
        return Err(ObservationError::unsafe_input(
            format!("The compressed {subject} input exceeds the safe read limit."),
            "Observe a smaller or known-good filesystem snapshot, then try again.",
            format!(
                "{} bytes exceeded the {} byte limit",
                metadata.len(),
                maximum_bytes
            ),
        ));
    }

    let file = File::open(&safe_file.absolute_path).map_err(|error| {
        ObservationError::io(
            format!("The {subject} input could not be opened read-only."),
            "Check read permissions or observe a readable filesystem snapshot, then try again.",
            format!("{}: {error}", safe_file.absolute_path.display()),
        )
    })?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    read_with_sentinel(
        file.take(sentinel_limit(maximum_bytes)),
        &mut bytes,
        subject,
    )?;
    if bytes.len() > maximum_bytes {
        return Err(ObservationError::unsafe_input(
            format!("The compressed {subject} input exceeds the safe read limit."),
            "Observe a smaller or known-good filesystem snapshot, then try again.",
            format!("more than {maximum_bytes} bytes were read"),
        ));
    }
    if bytes.len() as u64 != metadata.len() {
        return Err(ObservationError::changed(
            format!("The {subject} input changed while Elah was reading it."),
            "Stop the server or observe a filesystem snapshot, then try again.",
            format!(
                "metadata reported {} bytes but {} bytes were read",
                metadata.len(),
                bytes.len()
            ),
        ));
    }

    let evidence = InputEvidence {
        relative_path: safe_file.relative_path.clone(),
        logical_bytes: bytes.len() as u64,
        modified: metadata.modified().ok(),
        sha256: sha256_hex(&bytes),
    };
    Ok((bytes, evidence))
}

pub(crate) fn fingerprint_file(safe_file: &SafeFile) -> Result<InputEvidence, ObservationError> {
    let metadata = fs::symlink_metadata(&safe_file.absolute_path).map_err(|error| {
        ObservationError::io(
            "An observation input could not be read.",
            "Check permissions or observe a readable filesystem snapshot, then try again.",
            format!("{}: {error}", safe_file.absolute_path.display()),
        )
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(ObservationError::unsafe_input(
            "An observation input is no longer a safe regular file.",
            "Stop the server or observe a self-contained filesystem snapshot, then try again.",
            safe_file.absolute_path.display().to_string(),
        ));
    }
    let canonical = fs::canonicalize(&safe_file.absolute_path).map_err(|error| {
        ObservationError::io(
            "An observation input could not be resolved safely.",
            "Check permissions or observe a readable filesystem snapshot, then try again.",
            format!("{}: {error}", safe_file.absolute_path.display()),
        )
    })?;
    if canonical != safe_file.absolute_path {
        return Err(ObservationError::unsafe_input(
            "An observation input changed its filesystem identity.",
            "Stop the server or observe a filesystem snapshot, then try again.",
            format!(
                "{} resolved as {}",
                safe_file.absolute_path.display(),
                canonical.display()
            ),
        ));
    }

    let mut file = File::open(&safe_file.absolute_path).map_err(|error| {
        ObservationError::io(
            "An observation input could not be opened read-only.",
            "Check read permissions or observe a readable filesystem snapshot, then try again.",
            format!("{}: {error}", safe_file.absolute_path.display()),
        )
    })?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    let mut logical_bytes = 0_u64;
    loop {
        let count = file.read(&mut buffer).map_err(|error| {
            ObservationError::io(
                "An observation input could not be read completely.",
                "Check read permissions or observe a readable filesystem snapshot, then try again.",
                format!("{}: {error}", safe_file.absolute_path.display()),
            )
        })?;
        if count == 0 {
            break;
        }
        logical_bytes = logical_bytes.checked_add(count as u64).ok_or_else(|| {
            ObservationError::unsafe_input(
                "An observation input exceeds the supported byte range.",
                "Observe a smaller filesystem snapshot, then try again.",
                safe_file.relative_path.clone(),
            )
        })?;
        digest.update(&buffer[..count]);
    }
    if logical_bytes != metadata.len() {
        return Err(ObservationError::changed(
            "An observation input changed while Elah was reading it.",
            "Stop the server or observe a filesystem snapshot, then try again.",
            format!(
                "{}: metadata reported {} bytes but {} bytes were read",
                safe_file.relative_path,
                metadata.len(),
                logical_bytes
            ),
        ));
    }
    let digest = digest.finalize();
    let mut sha256 = String::with_capacity(digest.len() * 2);
    for byte in digest {
        use std::fmt::Write as _;
        write!(&mut sha256, "{byte:02x}").expect("writing to a String cannot fail");
    }
    Ok(InputEvidence {
        relative_path: safe_file.relative_path.clone(),
        logical_bytes,
        modified: metadata.modified().ok(),
        sha256,
    })
}

fn read_with_sentinel<R: Read>(
    mut reader: Take<R>,
    bytes: &mut Vec<u8>,
    subject: &str,
) -> Result<(), ObservationError> {
    reader.read_to_end(bytes).map_err(|error| {
        ObservationError::io(
            format!("The {subject} input could not be read completely."),
            "Check read permissions or observe a readable filesystem snapshot, then try again.",
            error.to_string(),
        )
    })?;
    Ok(())
}

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut output = String::with_capacity(digest.len() * 2);
    for byte in digest {
        use std::fmt::Write as _;
        write!(&mut output, "{byte:02x}").expect("writing to a String cannot fail");
    }
    output
}

pub(crate) fn sentinel_limit(maximum_bytes: usize) -> u64 {
    u64::try_from(maximum_bytes)
        .unwrap_or(u64::MAX)
        .saturating_add(1)
}

#[cfg(test)]
mod tests {
    use super::sha256_hex;

    #[test]
    fn sha256_evidence_uses_the_standard_lowercase_encoding() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
