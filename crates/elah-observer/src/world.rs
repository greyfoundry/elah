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

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use crate::dimension::discover_dimensions;
use crate::{DimensionKind, ObservationError, ObservationLimits};

/// A regular file proven to be within the selected world at discovery time.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SafeFile {
    /// Absolute canonical path used for read-only access.
    pub absolute_path: PathBuf,
    /// Forward-slash relative path used for deterministic reports.
    pub relative_path: String,
    /// Logical file length observed during discovery.
    pub logical_bytes: u64,
    /// Last modification time when the filesystem provides one.
    pub modified: Option<SystemTime>,
}

/// A dimension and its optional terrain region directory.
#[derive(Clone, Debug, PartialEq)]
pub struct DiscoveredDimension {
    /// Stable namespaced dimension identifier.
    pub id: String,
    /// Vanilla or custom source layout.
    pub kind: DimensionKind,
    /// Canonical region directory, absent for an empty overworld without one.
    pub region_directory: Option<PathBuf>,
}

/// Complete safe discovery result for one world root.
#[derive(Clone, Debug, PartialEq)]
pub struct DiscoveredWorld {
    /// Canonical world root.
    pub root: PathBuf,
    /// Required `level.dat` input.
    pub level_dat: SafeFile,
    /// Deterministically sorted dimensions.
    pub dimensions: Vec<DiscoveredDimension>,
    /// Deterministically sorted regular-file inventory.
    pub inventory: Vec<SafeFile>,
}

/// Discovers a Java world without opening any entry for writing.
pub fn discover_world(
    root: &Path,
    limits: ObservationLimits,
) -> Result<DiscoveredWorld, ObservationError> {
    let root_metadata = fs::symlink_metadata(root).map_err(|error| {
        ObservationError::unsupported_world(
            "The selected world path could not be read.",
            "Choose a readable Minecraft Java world directory or filesystem snapshot, then try again.",
            format!("{}: {error}", root.display()),
        )
    })?;
    if root_metadata.file_type().is_symlink() {
        return Err(symlink_error(root));
    }
    if !root_metadata.is_dir() {
        return Err(ObservationError::unsupported_world(
            "The selected world path is not a directory.",
            "Choose the root directory of a Minecraft Java world, then try again.",
            root.display().to_string(),
        ));
    }

    let canonical_root = fs::canonicalize(root).map_err(|error| {
        ObservationError::io(
            "The selected world directory could not be resolved safely.",
            "Check directory permissions or observe a readable filesystem snapshot, then try again.",
            format!("{}: {error}", root.display()),
        )
    })?;
    let mut inventory = Vec::new();
    let mut directories = BTreeMap::new();
    let mut path_count = 0;
    scan_directory(
        &canonical_root,
        &canonical_root,
        limits,
        &mut inventory,
        &mut directories,
        &mut path_count,
    )?;
    inventory.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    let level_dat = inventory
        .iter()
        .find(|file| file.relative_path == "level.dat")
        .cloned()
        .ok_or_else(|| {
            ObservationError::unsupported_world(
                "The selected directory does not contain a readable regular level.dat file.",
                "Choose the root of a Minecraft Java world or a complete filesystem snapshot, then try again.",
                canonical_root.display().to_string(),
            )
        })?;
    let dimensions = discover_dimensions(&canonical_root, &directories)?;

    Ok(DiscoveredWorld {
        root: canonical_root,
        level_dat,
        dimensions,
        inventory,
    })
}

fn scan_directory(
    root: &Path,
    directory: &Path,
    limits: ObservationLimits,
    inventory: &mut Vec<SafeFile>,
    directories: &mut BTreeMap<String, PathBuf>,
    path_count: &mut usize,
) -> Result<(), ObservationError> {
    let entries = fs::read_dir(directory).map_err(|error| {
        ObservationError::io(
            "A world directory could not be read.",
            "Check permissions or observe a readable filesystem snapshot, then try again.",
            format!("{}: {error}", directory.display()),
        )
    })?;
    let mut paths = entries
        .map(|entry| entry.map(|value| value.path()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| {
            ObservationError::io(
                "A world directory changed or became unreadable during discovery.",
                "Stop the server or observe a filesystem snapshot, then try again.",
                format!("{}: {error}", directory.display()),
            )
        })?;
    paths.sort();

    for path in paths {
        *path_count = path_count.checked_add(1).ok_or_else(|| {
            ObservationError::unsafe_input(
                "The world contains too many paths to inspect safely.",
                "Observe a smaller filesystem snapshot or raise the limit in a reviewed build, then try again.",
                "path counter overflowed",
            )
        })?;
        if *path_count > limits.max_paths {
            return Err(ObservationError::unsafe_input(
                "The world contains too many paths to inspect safely.",
                "Observe a smaller filesystem snapshot or raise the limit in a reviewed build, then try again.",
                format!("path limit {} was exceeded", limits.max_paths),
            ));
        }

        let metadata = fs::symlink_metadata(&path).map_err(|error| {
            ObservationError::io(
                "A world path changed or became unreadable during discovery.",
                "Stop the server or observe a filesystem snapshot, then try again.",
                format!("{}: {error}", path.display()),
            )
        })?;
        if metadata.file_type().is_symlink() {
            return Err(symlink_error(&path));
        }

        let canonical = fs::canonicalize(&path).map_err(|error| {
            ObservationError::io(
                "A world path could not be resolved safely.",
                "Check permissions or observe a filesystem snapshot, then try again.",
                format!("{}: {error}", path.display()),
            )
        })?;
        if !canonical.starts_with(root) {
            return Err(ObservationError::unsafe_input(
                "A world path resolves outside the selected world.",
                "Replace redirected paths with regular entries inside a filesystem snapshot, then try again.",
                format!(
                    "{} resolved outside {}",
                    canonical.display(),
                    root.display()
                ),
            ));
        }
        let relative = relative_path(root, &canonical)?;

        if metadata.is_dir() {
            directories.insert(relative, canonical.clone());
            scan_directory(root, &canonical, limits, inventory, directories, path_count)?;
        } else if metadata.is_file() {
            inventory.push(SafeFile {
                absolute_path: canonical,
                relative_path: relative,
                logical_bytes: metadata.len(),
                modified: metadata.modified().ok(),
            });
        } else {
            return Err(ObservationError::unsafe_input(
                "The world contains an unsupported filesystem entry.",
                "Replace special filesystem entries with regular files or directories in a snapshot, then try again.",
                path.display().to_string(),
            ));
        }
    }

    Ok(())
}

fn relative_path(root: &Path, path: &Path) -> Result<String, ObservationError> {
    let relative = path.strip_prefix(root).map_err(|error| {
        ObservationError::unsafe_input(
            "A world path resolves outside the selected world.",
            "Observe a self-contained filesystem snapshot, then try again.",
            format!("{}: {error}", path.display()),
        )
    })?;
    let rendered = relative.to_str().ok_or_else(|| {
        ObservationError::unsupported_world(
            "A world path cannot be represented as Unicode.",
            "Rename the path or observe a snapshot with Unicode filenames, then try again.",
            relative.display().to_string(),
        )
    })?;
    Ok(rendered.replace('\\', "/"))
}

fn symlink_error(path: &Path) -> ObservationError {
    ObservationError::unsafe_input(
        "The selected world contains a symbolic link, so Elah cannot prove the read boundary.",
        "Replace symbolic links with regular files or directories inside a filesystem snapshot, then try again.",
        path.display().to_string(),
    )
}
