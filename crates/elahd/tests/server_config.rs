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

use std::net::SocketAddr;

use elahd::server::validate_listen_address;

#[test]
fn plaintext_listener_accepts_only_loopback_addresses() {
    for address in ["127.0.0.1:50051", "[::1]:50051"] {
        assert!(
            validate_listen_address(address.parse::<SocketAddr>().unwrap()).is_ok(),
            "expected {address} to be accepted"
        );
    }

    for address in ["0.0.0.0:50051", "192.0.2.1:50051", "[::]:50051"] {
        let error = validate_listen_address(address.parse::<SocketAddr>().unwrap()).unwrap_err();
        assert!(error.to_string().contains("loopback"));
    }
}
