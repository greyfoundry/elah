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

use std::io::{self, Write};

use elah_observer::{ObservationError, ObservationEvent, ScanDepth, WorldReport};
use serde::Serialize;

use crate::OutputFormat;

const CONSEQUENCE: &str =
    "No report was produced because Elah could not verify a complete, stable observation.";

#[derive(Serialize)]
struct ErrorEnvelope<'a> {
    schema: &'static str,
    kind: elah_observer::ErrorKind,
    summary: &'a str,
    consequence: &'static str,
    recovery: &'a str,
    details: &'a [String],
}

pub(crate) fn event(writer: &mut dyn Write, event: &ObservationEvent) -> io::Result<()> {
    match event {
        ObservationEvent::StandardScanComplete {
            occupied_chunks,
            region_bytes,
        } => writeln!(
            writer,
            "Standard scan complete: {} occupied chunks across {} bytes of region storage.",
            number(*occupied_chunks),
            number(*region_bytes)
        ),
        ObservationEvent::DeepScanStarting {
            occupied_chunks,
            region_bytes,
        } => writeln!(
            writer,
            "Deep validation is reading and decompressing {} chunks ({} region bytes); this uses more I/O and CPU.",
            number(*occupied_chunks),
            number(*region_bytes)
        ),
        ObservationEvent::VerifyingConsistency => {
            writeln!(
                writer,
                "Verifying that report-driving world data stayed unchanged."
            )
        }
    }
}

pub(crate) fn success(
    writer: &mut dyn Write,
    format: OutputFormat,
    report: &WorldReport,
) -> io::Result<()> {
    match format {
        OutputFormat::Human => human_report(writer, report),
        OutputFormat::Json => {
            serde_json::to_writer(&mut *writer, report).map_err(io::Error::other)?;
            writeln!(writer)
        }
    }
}

pub(crate) fn failure(
    writer: &mut dyn Write,
    format: OutputFormat,
    error: &ObservationError,
    verbose: bool,
) -> io::Result<()> {
    match format {
        OutputFormat::Human => {
            writeln!(writer, "Observation failed: {}", error.summary())?;
            writeln!(writer, "{CONSEQUENCE}")?;
            writeln!(writer, "Recovery: {}", error.recovery())?;
            if verbose {
                writeln!(writer, "Technical details:")?;
                for detail in error.details() {
                    writeln!(writer, "  - {detail}")?;
                }
            } else {
                writeln!(
                    writer,
                    "Run again with --verbose to show technical details."
                )?;
            }
            Ok(())
        }
        OutputFormat::Json => {
            let details = if verbose { error.details() } else { &[] };
            serde_json::to_writer(
                &mut *writer,
                &ErrorEnvelope {
                    schema: "elah.error/v1",
                    kind: error.kind(),
                    summary: error.summary(),
                    consequence: CONSEQUENCE,
                    recovery: error.recovery(),
                    details,
                },
            )
            .map_err(io::Error::other)?;
            writeln!(writer)
        }
    }
}

fn human_report(writer: &mut dyn Write, report: &WorldReport) -> io::Result<()> {
    writeln!(writer, "Elah World Observation")?;
    writeln!(writer, "======================")?;
    writeln!(writer, "World: {}", report.world.resolved_path)?;
    writeln!(
        writer,
        "Saved name: {}",
        report.world.level_name.as_deref().unwrap_or("not present")
    )?;
    writeln!(writer, "Observer version: {}", report.observer_version)?;
    writeln!(
        writer,
        "Minecraft data version: {}",
        report
            .world
            .data_version
            .map_or_else(|| "not present".to_owned(), |value| value.to_string())
    )?;
    writeln!(writer, "Scan depth: {}", depth(report.scan.depth))?;
    writeln!(writer, "Consistency verified: yes")?;
    writeln!(writer)?;
    writeln!(writer, "Totals")?;
    writeln!(
        writer,
        "  Logical bytes: {} bytes",
        number(report.totals.logical_bytes)
    )?;
    writeln!(
        writer,
        "  Region bytes: {} bytes",
        number(report.totals.region_bytes)
    )?;
    writeln!(
        writer,
        "  Region files: {}",
        number(report.totals.region_files)
    )?;
    writeln!(
        writer,
        "  Occupied chunks: {}",
        number(report.totals.occupied_chunks)
    )?;
    writeln!(writer)?;
    writeln!(writer, "Dimensions")?;
    writeln!(writer, "  ID | Regions | Chunks | Region bytes | Share")?;
    for dimension in &report.dimensions {
        writeln!(
            writer,
            "  {} | {} | {} | {} | {:.2}%",
            dimension.id,
            number(dimension.region_files),
            number(dimension.occupied_chunks),
            number(dimension.region_bytes),
            dimension.storage_percent
        )?;
    }
    if let Some(deep) = &report.deep_validation {
        writeln!(writer)?;
        writeln!(writer, "Deep validation")?;
        writeln!(writer, "  Decoded chunks: {}", number(deep.decoded_chunks))?;
        writeln!(
            writer,
            "  Data versions: {} distinct",
            deep.data_versions.len()
        )?;
        writeln!(writer, "  Chunk statuses: {} distinct", deep.statuses.len())?;
    }
    writeln!(writer)?;
    writeln!(writer, "Limitations")?;
    for limitation in &report.limitations {
        writeln!(writer, "  - {limitation}")?;
    }
    Ok(())
}

fn depth(value: ScanDepth) -> &'static str {
    match value {
        ScanDepth::Standard => "standard",
        ScanDepth::Deep => "deep",
    }
}

fn number(value: u64) -> String {
    let digits = value.to_string();
    let mut output = String::with_capacity(digits.len() + digits.len() / 3);
    for (index, character) in digits.chars().enumerate() {
        if index != 0 && (digits.len() - index).is_multiple_of(3) {
            output.push(',');
        }
        output.push(character);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::number;

    #[test]
    fn exact_byte_counts_use_unambiguous_grouping() {
        assert_eq!(number(0), "0");
        assert_eq!(number(999), "999");
        assert_eq!(number(1_000), "1,000");
        assert_eq!(number(12_345_678), "12,345,678");
    }
}
