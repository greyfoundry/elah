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

use elahd::registry::{
    HeartbeatCommand, RegisterCommand, Registry, RegistryError, WorkerCapacity, WorkerLoad,
    WorkerProfile,
};

fn profile(hostname: &str) -> WorkerProfile {
    WorkerProfile {
        hostname: hostname.to_owned(),
        minecraft_version: "laboratory".to_owned(),
        capacity: WorkerCapacity {
            cpu_cores: 2,
            memory_bytes: 1_073_741_824,
        },
    }
}

fn register(worker_id: &str, session_id: &str) -> RegisterCommand {
    RegisterCommand {
        worker_id: worker_id.to_owned(),
        session_id: session_id.to_owned(),
        profile: profile("loopback"),
    }
}

fn load(players: u32) -> WorkerLoad {
    WorkerLoad {
        player_count: players,
        loaded_chunks: u64::from(players) * 8,
        memory_used_bytes: u64::from(players) * 1024,
    }
}

fn heartbeat(session_id: &str, sequence: u64, players: u32) -> HeartbeatCommand {
    HeartbeatCommand {
        worker_id: "worker-a".to_owned(),
        session_id: session_id.to_owned(),
        sequence,
        load: load(players),
    }
}

#[test]
fn registration_is_idempotent_for_the_current_session() {
    let mut registry = Registry::default();

    let first = registry
        .register(register("worker-a", "session-1"))
        .unwrap();
    let repeated = registry
        .register(register("worker-a", "session-1"))
        .unwrap();

    assert_eq!(first.generation, 1);
    assert!(!first.replaced_previous_session);
    assert_eq!(repeated, first);
}

#[test]
fn a_fresh_session_advances_generation_and_retires_the_previous_session() {
    let mut registry = Registry::default();
    registry
        .register(register("worker-a", "session-1"))
        .unwrap();

    let replacement = registry
        .register(register("worker-a", "session-2"))
        .unwrap();

    assert_eq!(replacement.generation, 2);
    assert!(replacement.replaced_previous_session);
    assert_eq!(
        registry.register(register("worker-a", "session-1")),
        Err(RegistryError::RetiredSession)
    );
    assert_eq!(
        registry.snapshot("worker-a").unwrap().session_id,
        "session-2"
    );
}

#[test]
fn heartbeats_are_monotonic_and_duplicates_do_not_replace_load() {
    let mut registry = Registry::default();
    registry
        .register(register("worker-a", "session-1"))
        .unwrap();

    let accepted = registry.heartbeat(heartbeat("session-1", 1, 4)).unwrap();
    let duplicate = registry.heartbeat(heartbeat("session-1", 1, 99)).unwrap();

    assert_eq!(accepted.generation, 1);
    assert_eq!(accepted.accepted_sequence, 1);
    assert!(!accepted.duplicate);
    assert!(duplicate.duplicate);
    assert_eq!(registry.snapshot("worker-a").unwrap().load, Some(load(4)));

    registry.heartbeat(heartbeat("session-1", 3, 6)).unwrap();
    assert_eq!(
        registry.heartbeat(heartbeat("session-1", 2, 7)),
        Err(RegistryError::StaleSequence {
            accepted: 3,
            received: 2,
        })
    );
}

#[test]
fn retired_and_unknown_sessions_cannot_send_heartbeats() {
    let mut registry = Registry::default();
    assert_eq!(
        registry.heartbeat(heartbeat("session-1", 1, 1)),
        Err(RegistryError::UnknownWorker)
    );

    registry
        .register(register("worker-a", "session-1"))
        .unwrap();
    registry
        .register(register("worker-a", "session-2"))
        .unwrap();

    assert_eq!(
        registry.heartbeat(heartbeat("session-1", 1, 1)),
        Err(RegistryError::RetiredSession)
    );
    assert_eq!(
        registry.heartbeat(heartbeat("never-registered", 1, 1)),
        Err(RegistryError::UnknownSession)
    );
}

#[test]
fn blank_worker_and_session_identifiers_are_rejected() {
    let mut registry = Registry::default();

    assert_eq!(
        registry.register(register("  ", "session-1")),
        Err(RegistryError::InvalidIdentifier("worker_id"))
    );
    assert_eq!(
        registry.register(register("worker-a", "")),
        Err(RegistryError::InvalidIdentifier("session_id"))
    );
}
