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

//! Deterministic in-memory worker lifecycle state.

use std::collections::{HashMap, HashSet};
use std::error::Error;
use std::fmt::{self, Display, Formatter};

/// Static capacity declared by a worker session.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkerCapacity {
    pub cpu_cores: u32,
    pub memory_bytes: u64,
}

/// Descriptive information captured when a worker registers.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkerProfile {
    pub hostname: String,
    pub minecraft_version: String,
    pub capacity: WorkerCapacity,
}

/// Latest dynamic load accepted from a worker session.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkerLoad {
    pub player_count: u32,
    pub loaded_chunks: u64,
    pub memory_used_bytes: u64,
}

/// Input for registering one process session under a stable worker identifier.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RegisterCommand {
    pub worker_id: String,
    pub session_id: String,
    pub profile: WorkerProfile,
}

/// Result of a successful worker registration.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RegisterOutcome {
    pub generation: u64,
    pub replaced_previous_session: bool,
}

/// Input for a sequenced worker load sample.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HeartbeatCommand {
    pub worker_id: String,
    pub session_id: String,
    pub sequence: u64,
    pub load: WorkerLoad,
}

/// Result of a successfully accepted or idempotently repeated heartbeat.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct HeartbeatOutcome {
    pub generation: u64,
    pub accepted_sequence: u64,
    pub duplicate: bool,
}

/// Read-only view of the current session for a worker.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkerSnapshot {
    pub worker_id: String,
    pub session_id: String,
    pub generation: u64,
    pub profile: WorkerProfile,
    pub accepted_sequence: Option<u64>,
    pub load: Option<WorkerLoad>,
}

#[derive(Clone, Debug)]
struct WorkerState {
    session_id: String,
    generation: u64,
    profile: WorkerProfile,
    accepted_sequence: Option<u64>,
    load: Option<WorkerLoad>,
    retired_sessions: HashSet<String>,
}

/// Failures that protect the worker-session state machine.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RegistryError {
    InvalidIdentifier(&'static str),
    UnknownWorker,
    UnknownSession,
    RetiredSession,
    StaleSequence { accepted: u64, received: u64 },
}

impl Display for RegistryError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidIdentifier(field) => write!(formatter, "{field} must be non-empty"),
            Self::UnknownWorker => formatter.write_str("worker is not registered"),
            Self::UnknownSession => {
                formatter.write_str("session is not registered for this worker")
            }
            Self::RetiredSession => formatter.write_str("session has been retired"),
            Self::StaleSequence { accepted, received } => write!(
                formatter,
                "heartbeat sequence {received} is older than accepted sequence {accepted}"
            ),
        }
    }
}

impl Error for RegistryError {}

/// In-memory registry used by the Protocol Laboratory controller.
#[derive(Debug, Default)]
pub struct Registry {
    workers: HashMap<String, WorkerState>,
}

impl Registry {
    /// Registers a session, preserving idempotency and permanently retiring replacements.
    pub fn register(&mut self, command: RegisterCommand) -> Result<RegisterOutcome, RegistryError> {
        validate_identifier("worker_id", &command.worker_id)?;
        validate_identifier("session_id", &command.session_id)?;

        if let Some(state) = self.workers.get_mut(&command.worker_id) {
            if state.session_id == command.session_id {
                return Ok(RegisterOutcome {
                    generation: state.generation,
                    replaced_previous_session: false,
                });
            }
            if state.retired_sessions.contains(&command.session_id) {
                return Err(RegistryError::RetiredSession);
            }

            state.retired_sessions.insert(state.session_id.clone());
            state.session_id = command.session_id;
            state.generation += 1;
            state.profile = command.profile;
            state.accepted_sequence = None;
            state.load = None;
            return Ok(RegisterOutcome {
                generation: state.generation,
                replaced_previous_session: true,
            });
        }

        self.workers.insert(
            command.worker_id,
            WorkerState {
                session_id: command.session_id,
                generation: 1,
                profile: command.profile,
                accepted_sequence: None,
                load: None,
                retired_sessions: HashSet::new(),
            },
        );
        Ok(RegisterOutcome {
            generation: 1,
            replaced_previous_session: false,
        })
    }

    /// Accepts a current-session heartbeat if its sequence is monotonic.
    pub fn heartbeat(
        &mut self,
        command: HeartbeatCommand,
    ) -> Result<HeartbeatOutcome, RegistryError> {
        validate_identifier("worker_id", &command.worker_id)?;
        validate_identifier("session_id", &command.session_id)?;
        let state = self
            .workers
            .get_mut(&command.worker_id)
            .ok_or(RegistryError::UnknownWorker)?;

        if state.session_id != command.session_id {
            return if state.retired_sessions.contains(&command.session_id) {
                Err(RegistryError::RetiredSession)
            } else {
                Err(RegistryError::UnknownSession)
            };
        }

        if let Some(accepted) = state.accepted_sequence {
            if command.sequence < accepted {
                return Err(RegistryError::StaleSequence {
                    accepted,
                    received: command.sequence,
                });
            }
            if command.sequence == accepted {
                return Ok(HeartbeatOutcome {
                    generation: state.generation,
                    accepted_sequence: accepted,
                    duplicate: true,
                });
            }
        }

        state.accepted_sequence = Some(command.sequence);
        state.load = Some(command.load);
        Ok(HeartbeatOutcome {
            generation: state.generation,
            accepted_sequence: command.sequence,
            duplicate: false,
        })
    }

    /// Returns the current state for a worker without exposing retired session identifiers.
    #[must_use]
    pub fn snapshot(&self, worker_id: &str) -> Option<WorkerSnapshot> {
        self.workers.get(worker_id).map(|state| WorkerSnapshot {
            worker_id: worker_id.to_owned(),
            session_id: state.session_id.clone(),
            generation: state.generation,
            profile: state.profile.clone(),
            accepted_sequence: state.accepted_sequence,
            load: state.load.clone(),
        })
    }
}

fn validate_identifier(field: &'static str, value: &str) -> Result<(), RegistryError> {
    if value.trim().is_empty() {
        Err(RegistryError::InvalidIdentifier(field))
    } else {
        Ok(())
    }
}
