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

//! Tonic adapter for the in-memory worker registry.

use std::sync::Arc;

use elah_protocol::control::v1::worker_control_service_server::WorkerControlService;
use elah_protocol::control::v1::{
    HeartbeatRequest, HeartbeatResponse, ProtocolVersion, RegisterWorkerRequest,
    RegisterWorkerResponse, RequestContext,
};
use semver::Version;
use tokio::sync::Mutex;
use tonic::{Request, Response, Status};
use tracing::{Instrument, info, info_span};

use crate::registry::{
    HeartbeatCommand, RegisterCommand, Registry, RegistryError, WorkerCapacity, WorkerLoad,
    WorkerProfile,
};

const PROTOCOL_MAJOR: u64 = 0;
const PROTOCOL_MINOR: u64 = 0;
const PROTOCOL_PATCH: u64 = 2;

/// gRPC boundary for the Protocol Laboratory registry.
#[derive(Clone, Debug, Default)]
pub struct WorkerControlRpc {
    registry: Arc<Mutex<Registry>>,
}

impl WorkerControlRpc {
    /// Creates a service around a caller-supplied registry.
    #[must_use]
    pub fn new(registry: Arc<Mutex<Registry>>) -> Self {
        Self { registry }
    }
}

#[tonic::async_trait]
impl WorkerControlService for WorkerControlRpc {
    async fn register_worker(
        &self,
        request: Request<RegisterWorkerRequest>,
    ) -> Result<Response<RegisterWorkerResponse>, Status> {
        let request = request.into_inner();
        let context = validate_context(request.context.as_ref())?;
        let span = info_span!(
            "register_worker",
            request_id = %context.request_id,
            trace_id = %context.trace_id,
            cluster_id = %context.cluster_id,
            worker_id = %request.worker_id,
            session_id = %request.session_id,
        );
        async move {
            let profile = request
                .profile
                .ok_or_else(|| Status::invalid_argument("profile is required"))?;
            let capacity = profile
                .capacity
                .ok_or_else(|| Status::invalid_argument("profile.capacity is required"))?;
            require_nonblank("profile.hostname", &profile.hostname)?;

            let outcome = self
                .registry
                .lock()
                .await
                .register(RegisterCommand {
                    worker_id: request.worker_id,
                    session_id: request.session_id,
                    profile: WorkerProfile {
                        hostname: profile.hostname,
                        minecraft_version: profile.minecraft_version,
                        capacity: WorkerCapacity {
                            cpu_cores: capacity.cpu_cores,
                            memory_bytes: capacity.memory_bytes,
                        },
                    },
                })
                .map_err(map_registry_error)?;
            info!(
                generation = outcome.generation,
                replaced_previous_session = outcome.replaced_previous_session,
                "worker registration accepted"
            );
            Ok(Response::new(RegisterWorkerResponse {
                generation: outcome.generation,
                replaced_previous_session: outcome.replaced_previous_session,
            }))
        }
        .instrument(span)
        .await
    }

    async fn heartbeat(
        &self,
        request: Request<HeartbeatRequest>,
    ) -> Result<Response<HeartbeatResponse>, Status> {
        let request = request.into_inner();
        let context = validate_context(request.context.as_ref())?;
        let span = info_span!(
            "heartbeat",
            request_id = %context.request_id,
            trace_id = %context.trace_id,
            cluster_id = %context.cluster_id,
            worker_id = %request.worker_id,
            session_id = %request.session_id,
            sequence = request.sequence,
        );
        async move {
            let load = request
                .load
                .ok_or_else(|| Status::invalid_argument("load is required"))?;
            let outcome = self
                .registry
                .lock()
                .await
                .heartbeat(HeartbeatCommand {
                    worker_id: request.worker_id,
                    session_id: request.session_id,
                    sequence: request.sequence,
                    load: WorkerLoad {
                        player_count: load.player_count,
                        loaded_chunks: load.loaded_chunks,
                        memory_used_bytes: load.memory_used_bytes,
                    },
                })
                .map_err(map_registry_error)?;
            info!(
                generation = outcome.generation,
                accepted_sequence = outcome.accepted_sequence,
                duplicate = outcome.duplicate,
                "worker heartbeat accepted"
            );
            Ok(Response::new(HeartbeatResponse {
                generation: outcome.generation,
                accepted_sequence: outcome.accepted_sequence,
                duplicate: outcome.duplicate,
            }))
        }
        .instrument(span)
        .await
    }
}

fn validate_context(context: Option<&RequestContext>) -> Result<&RequestContext, Status> {
    let context = context.ok_or_else(|| Status::invalid_argument("context is required"))?;
    require_nonblank("context.request_id", &context.request_id)?;
    require_nonblank("context.trace_id", &context.trace_id)?;
    require_nonblank("context.cluster_id", &context.cluster_id)?;
    parse_semver("context.product_semver", &context.product_semver)?;
    let caller = context
        .caller
        .as_ref()
        .ok_or_else(|| Status::invalid_argument("context.caller is required"))?;
    require_nonblank("context.caller.component_name", &caller.component_name)?;
    parse_semver("context.caller.semantic_version", &caller.semantic_version)?;

    let current = context
        .current_protocol
        .as_ref()
        .ok_or_else(|| Status::invalid_argument("context.current_protocol is required"))?;
    let minimum = context
        .minimum_protocol
        .as_ref()
        .ok_or_else(|| Status::invalid_argument("context.minimum_protocol is required"))?;
    let current = protocol_version(current);
    let minimum = protocol_version(minimum);
    let server = Version::new(PROTOCOL_MAJOR, PROTOCOL_MINOR, PROTOCOL_PATCH);
    if current < server || minimum > server {
        return Err(Status::failed_precondition(format!(
            "protocol range {minimum}..={current} does not include server protocol {server}"
        )));
    }
    if minimum > current {
        return Err(Status::invalid_argument(
            "minimum_protocol must not exceed current_protocol",
        ));
    }
    Ok(context)
}

fn protocol_version(version: &ProtocolVersion) -> Version {
    Version::new(
        u64::from(version.major),
        u64::from(version.minor),
        u64::from(version.patch),
    )
}

fn parse_semver(field: &'static str, value: &str) -> Result<Version, Status> {
    require_nonblank(field, value)?;
    Version::parse(value).map_err(|_| Status::invalid_argument(format!("{field} must be SemVer")))
}

fn require_nonblank(field: &'static str, value: &str) -> Result<(), Status> {
    if value.trim().is_empty() {
        Err(Status::invalid_argument(format!(
            "{field} must be non-empty"
        )))
    } else {
        Ok(())
    }
}

fn map_registry_error(error: RegistryError) -> Status {
    match error {
        RegistryError::InvalidIdentifier(_) => Status::invalid_argument(error.to_string()),
        RegistryError::UnknownWorker => Status::not_found(error.to_string()),
        RegistryError::UnknownSession => Status::failed_precondition(error.to_string()),
        RegistryError::RetiredSession => Status::failed_precondition(error.to_string()),
        RegistryError::StaleSequence { .. } => Status::out_of_range(error.to_string()),
    }
}
