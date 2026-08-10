# Architecture

## Purpose and boundary

Elah is a distributed orchestration and ownership layer for Minecraft worlds. It is not a Minecraft server implementation, a Folia replacement, a proxy, a database, or a C2ME port.

```text
Minecraft protocol and player connections: Velocity -> Sling
Machine-level ownership and distribution:     Elah
Within-worker simulation concurrency:         Folia
Storage services:                             Stone
Placement and workload scheduling:            Shepherd in elahd
Generation and pregeneration:                 Brook
Independent validation:                       PrismarineJS ecosystem
```

Folia owns vertical concurrency inside a worker process. Elah owns horizontal coordination between workers. Neither layer should absorb the other's responsibility without benchmarked evidence and an ADR.

## Planned components

| Component | Responsibility |
| --- | --- |
| `elahd` | Rust control-plane daemon for membership, topology, cell ownership, and ownership epochs. |
| `elah` | Administrator CLI and eventual primary management client. |
| ElahFolia | Thin Folia runtime integration; it must not become a server fork. |
| Sling | Velocity integration for routing, backend switching, handoff retries, and handoff observability. |
| Shepherd | Placement and workload scheduler inside `elahd`. |
| Stone | Persistent-world storage subsystem. |
| Brook | Chunk-generation and pregeneration subsystem. |

Control-plane RPC will use Protocol Buffers, gRPC, and TLS. Calls carry a request ID, trace ID, caller identity, deadline, protocol version, and cluster ID. Ownership-sensitive calls additionally carry cell ID, epoch, and operation ID.

## Ownership model

Elah assigns an authoritative worker to each active `(world, dimension, cell)` at an ownership epoch. A worker can write only while its epoch is current. Neighbouring workers may retain read-only ghost state, but ghost state is never authoritative.

Cells are deliberately coarser than chunks. A cell contains one or more storage-aligned tiles; the initial default is four by four tiles (128 by 128 chunks). This reduces coordination and handoff frequency while preserving a path to future split and merge work.

## Data and control planes

The control plane manages topology, ownership, health, and administrative operations. It does not carry normal gameplay traffic such as movement, block changes, inventory interactions, chunk packets, or entity ticks. The data plane stays on the client, Velocity, and worker path.

## Runtime and patch policy

ElahFolia follows this escalation order: Folia public API, normal Folia plugin, small upstreamable API extension, then minimal Elah-specific patch. Every patch needs an ADR describing the unsolved problem, alternatives, affected upstream files, threading and persistence implications, tests, upgrade risk, and upstreaming potential.

## Repository approach

Elah is a monorepo because protocol changes span Rust, Java, and TypeScript validation together. Current roots include `crates/`, `java/`, `lab/`, `proto/`, `schemas/`, `scripts/`, `docs/`, and `studying/`; later implementation may add `tests/`. The `studying/` tree is isolated: no production source, build, release artifact, or runtime dependency may import or resolve from it.

Protocol Laboratory implements only the versioned, loopback-only `elahd` worker-registration and heartbeat path. Its registry is deliberately in memory and has no ownership, placement, storage, failover, or gameplay authority.
