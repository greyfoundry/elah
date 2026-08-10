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

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::{DimensionKind, ObservationError};

use super::world::DiscoveredDimension;

pub(crate) fn discover_dimensions(
    root: &Path,
    directories: &BTreeMap<String, PathBuf>,
) -> Result<Vec<DiscoveredDimension>, ObservationError> {
    let mut dimensions = Vec::new();
    dimensions.push(DiscoveredDimension {
        id: "minecraft:overworld".to_owned(),
        kind: DimensionKind::Overworld,
        region_directory: directories.get("region").cloned(),
    });

    if let Some(directory) = directories.get("DIM-1/region") {
        dimensions.push(DiscoveredDimension {
            id: "minecraft:the_nether".to_owned(),
            kind: DimensionKind::Nether,
            region_directory: Some(directory.clone()),
        });
    }
    if let Some(directory) = directories.get("DIM1/region") {
        dimensions.push(DiscoveredDimension {
            id: "minecraft:the_end".to_owned(),
            kind: DimensionKind::End,
            region_directory: Some(directory.clone()),
        });
    }

    for (relative, directory) in directories {
        let Some(identifier) = custom_dimension_identifier(relative) else {
            continue;
        };
        dimensions.push(DiscoveredDimension {
            id: identifier,
            kind: DimensionKind::Custom,
            region_directory: Some(directory.clone()),
        });
    }

    dimensions.sort_by(|left, right| left.id.cmp(&right.id));
    dimensions.dedup_by(|left, right| left.id == right.id);

    for dimension in &dimensions {
        if let Some(path) = &dimension.region_directory
            && !path.starts_with(root)
        {
            return Err(ObservationError::unsafe_input(
                "A dimension directory resolves outside the selected world.",
                "Replace redirected dimension paths with regular directories inside a filesystem snapshot, then try again.",
                format!("{} resolved outside {}", path.display(), root.display()),
            ));
        }
    }

    Ok(dimensions)
}

fn custom_dimension_identifier(relative: &str) -> Option<String> {
    let components: Vec<_> = relative.split('/').collect();
    if components.len() < 4
        || components.first().copied() != Some("dimensions")
        || components.last().copied() != Some("region")
    {
        return None;
    }

    let namespace = components[1];
    let path = &components[2..components.len() - 1];
    if !valid_identifier_part(namespace) || path.iter().any(|part| !valid_identifier_part(part)) {
        return None;
    }

    Some(format!("{namespace}:{}", path.join("/")))
}

fn valid_identifier_part(value: &str) -> bool {
    !value.is_empty()
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"_.-".contains(&byte)
        })
}
