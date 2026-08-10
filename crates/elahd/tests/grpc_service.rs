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

use elah_protocol::control::v1::worker_control_service_client::WorkerControlServiceClient;
use elah_protocol::control::v1::worker_control_service_server::WorkerControlServiceServer;
use elah_protocol::control::v1::{
    ComponentIdentity, HeartbeatRequest, ProtocolVersion, RegisterWorkerRequest, RequestContext,
    WorkerCapacity, WorkerLoad, WorkerProfile,
};
use elahd::service::WorkerControlRpc;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio_stream::wrappers::TcpListenerStream;
use tonic::transport::{Channel, Server};
use tonic::{Code, Request};

struct TestServer {
    client: WorkerControlServiceClient<Channel>,
    shutdown: Option<oneshot::Sender<()>>,
}

impl Drop for TestServer {
    fn drop(&mut self) {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
    }
}

async fn start_server() -> TestServer {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let incoming = TcpListenerStream::new(listener);
    let (shutdown, stopped) = oneshot::channel();
    let service = WorkerControlRpc::default();
    tokio::spawn(async move {
        Server::builder()
            .add_service(WorkerControlServiceServer::new(service))
            .serve_with_incoming_shutdown(incoming, async {
                let _ = stopped.await;
            })
            .await
            .unwrap();
    });
    let client = WorkerControlServiceClient::connect(format!("http://{address}"))
        .await
        .unwrap();
    TestServer {
        client,
        shutdown: Some(shutdown),
    }
}

fn context() -> RequestContext {
    RequestContext {
        request_id: "request-001".to_owned(),
        trace_id: "trace-001".to_owned(),
        cluster_id: "laboratory".to_owned(),
        product_semver: "0.0.3".to_owned(),
        current_protocol: Some(ProtocolVersion {
            major: 0,
            minor: 0,
            patch: 2,
        }),
        minimum_protocol: Some(ProtocolVersion {
            major: 0,
            minor: 0,
            patch: 2,
        }),
        caller: Some(ComponentIdentity {
            component_name: "integration-test".to_owned(),
            semantic_version: "0.0.3".to_owned(),
        }),
    }
}

fn registration(session_id: &str) -> RegisterWorkerRequest {
    RegisterWorkerRequest {
        context: Some(context()),
        worker_id: "worker-a".to_owned(),
        session_id: session_id.to_owned(),
        profile: Some(WorkerProfile {
            hostname: "loopback".to_owned(),
            minecraft_version: "laboratory".to_owned(),
            capacity: Some(WorkerCapacity {
                cpu_cores: 2,
                memory_bytes: 1_073_741_824,
            }),
        }),
    }
}

fn heartbeat(session_id: &str, sequence: u64) -> HeartbeatRequest {
    HeartbeatRequest {
        context: Some(context()),
        worker_id: "worker-a".to_owned(),
        session_id: session_id.to_owned(),
        sequence,
        load: Some(WorkerLoad {
            player_count: 4,
            loaded_chunks: 32,
            memory_used_bytes: 4096,
        }),
    }
}

#[tokio::test]
async fn registration_and_heartbeat_cross_a_real_grpc_connection() {
    let mut server = start_server().await;

    let registration = server
        .client
        .register_worker(Request::new(registration("session-1")))
        .await
        .unwrap()
        .into_inner();
    let heartbeat = server
        .client
        .heartbeat(Request::new(heartbeat("session-1", 1)))
        .await
        .unwrap()
        .into_inner();

    assert_eq!(registration.generation, 1);
    assert_eq!(heartbeat.accepted_sequence, 1);
    assert!(!heartbeat.duplicate);
}

#[tokio::test]
async fn replaced_sessions_are_rejected_over_the_wire() {
    let mut server = start_server().await;
    server
        .client
        .register_worker(Request::new(registration("session-1")))
        .await
        .unwrap();
    let replacement = server
        .client
        .register_worker(Request::new(registration("session-2")))
        .await
        .unwrap()
        .into_inner();

    let error = server
        .client
        .heartbeat(Request::new(heartbeat("session-1", 1)))
        .await
        .unwrap_err();

    assert_eq!(replacement.generation, 2);
    assert!(replacement.replaced_previous_session);
    assert_eq!(error.code(), Code::FailedPrecondition);
}

#[tokio::test]
async fn missing_and_incompatible_context_is_invalid_argument() {
    let mut server = start_server().await;
    let mut missing = registration("session-1");
    missing.context = None;
    let missing_error = server
        .client
        .register_worker(Request::new(missing))
        .await
        .unwrap_err();

    let mut incompatible = registration("session-1");
    incompatible.context.as_mut().unwrap().current_protocol = Some(ProtocolVersion {
        major: 0,
        minor: 0,
        patch: 1,
    });
    let incompatible_error = server
        .client
        .register_worker(Request::new(incompatible))
        .await
        .unwrap_err();

    assert_eq!(missing_error.code(), Code::InvalidArgument);
    assert_eq!(incompatible_error.code(), Code::FailedPrecondition);
}
