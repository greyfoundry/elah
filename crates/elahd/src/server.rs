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

//! Loopback-only gRPC server assembly.

use std::future::Future;
use std::io;
use std::net::SocketAddr;

use elah_protocol::control::v1::worker_control_service_server::WorkerControlServiceServer;
use tokio::net::TcpListener;
use tokio_stream::wrappers::TcpListenerStream;
use tonic::transport::Server;

use crate::service::WorkerControlRpc;

/// Rejects non-loopback plaintext listeners before a socket is opened.
pub fn validate_listen_address(address: SocketAddr) -> Result<(), io::Error> {
    if address.ip().is_loopback() {
        Ok(())
    } else {
        Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "the plaintext Protocol Laboratory listener must use a loopback address",
        ))
    }
}

/// Serves the worker-control RPC until the supplied shutdown future completes.
pub async fn serve(
    listener: TcpListener,
    shutdown: impl Future<Output = ()> + Send + 'static,
) -> Result<(), tonic::transport::Error> {
    Server::builder()
        .add_service(WorkerControlServiceServer::new(WorkerControlRpc::default()))
        .serve_with_incoming_shutdown(TcpListenerStream::new(listener), shutdown)
        .await
}
