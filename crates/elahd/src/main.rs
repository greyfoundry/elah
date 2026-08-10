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

use std::error::Error;
use std::net::SocketAddr;

use clap::Parser;
use elahd::server::{serve, validate_listen_address};
use tokio::net::TcpListener;
use tracing::info;
use tracing_subscriber::EnvFilter;

#[derive(Debug, Parser)]
#[command(name = "elahd", version, about = "Elah Protocol Laboratory controller")]
struct Arguments {
    /// Plaintext loopback address used by the laboratory gRPC listener.
    #[arg(long, default_value = "127.0.0.1:50051")]
    listen: SocketAddr,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with_target(false)
        .init();

    let arguments = Arguments::parse();
    validate_listen_address(arguments.listen)?;
    let listener = TcpListener::bind(arguments.listen).await?;
    let address = listener.local_addr()?;
    println!("ELAH_READY {address}");
    info!(%address, "Protocol Laboratory controller ready");

    serve(listener, async {
        if let Err(error) = tokio::signal::ctrl_c().await {
            tracing::error!(%error, "failed to install shutdown signal handler");
        }
        info!("shutdown signal received");
    })
    .await?;
    Ok(())
}
