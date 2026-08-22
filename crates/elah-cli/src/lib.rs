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

mod exit;
mod render;

use std::ffi::OsString;
use std::io::Write;
use std::path::PathBuf;

use clap::{Args, Parser, Subcommand, ValueEnum};
use elah_observer::{ObservationError, ObservationEvent, ObserveRequest, ScanDepth, WorldReport};

/// Output representation selected by an operator.
#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
pub enum OutputFormat {
    /// Readable terminal report.
    Human,
    /// Stable machine-readable JSON document.
    Json,
}

#[derive(Debug, Parser)]
#[command(name = "elah", version, about = "Elah administrator tools")]
struct Arguments {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Inspect a Minecraft Java Anvil world without modifying it.
    Observe(ObserveArguments),
}

#[derive(Debug, Args)]
struct ObserveArguments {
    /// Minecraft Java world root containing level.dat.
    world: PathBuf,
    /// Decode every occupied chunk within hard limits; costs more I/O, CPU, and time.
    #[arg(long)]
    deep: bool,
    /// Success and error report format.
    #[arg(long, value_enum, default_value_t = OutputFormat::Human)]
    format: OutputFormat,
    /// Show bounded technical evidence in addition to the actionable failure.
    #[arg(long)]
    verbose: bool,
}

/// Runs the CLI against an injected observer, returning the process exit code.
pub fn run_with<I, T, F>(
    arguments: I,
    stdout: &mut dyn Write,
    stderr: &mut dyn Write,
    mut observer: F,
) -> u8
where
    I: IntoIterator<Item = T>,
    T: Into<OsString> + Clone,
    F: FnMut(
        ObserveRequest,
        &mut dyn FnMut(&ObservationEvent),
    ) -> Result<WorldReport, ObservationError>,
{
    let arguments = match Arguments::try_parse_from(arguments) {
        Ok(arguments) => arguments,
        Err(error) => {
            let code = u8::try_from(error.exit_code()).unwrap_or(exit::USAGE);
            if error.use_stderr() {
                let _ = write!(stderr, "{error}");
            } else {
                let _ = write!(stdout, "{error}");
            }
            return code;
        }
    };
    match arguments.command {
        Command::Observe(arguments) => {
            let depth = if arguments.deep {
                ScanDepth::Deep
            } else {
                ScanDepth::Standard
            };
            let mut event_error = None;
            let result = {
                let mut on_event = |event: &ObservationEvent| {
                    if event_error.is_none()
                        && let Err(error) = render::event(stderr, event)
                    {
                        event_error = Some(error);
                    }
                };
                observer(ObserveRequest::new(arguments.world, depth), &mut on_event)
            };
            if event_error.is_some() {
                return exit::INVALID_OR_IO;
            }
            match result {
                Ok(report) => match render::success(stdout, arguments.format, &report) {
                    Ok(()) => exit::SUCCESS,
                    Err(_) => exit::INVALID_OR_IO,
                },
                Err(error) => {
                    let code = exit::for_error(error.kind());
                    let _ = render::failure(stderr, arguments.format, &error, arguments.verbose);
                    code
                }
            }
        }
    }
}
