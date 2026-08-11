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

## Infrastructure boundary

The project boundary is:

> Generic infrastructure manages machines. Elah manages Minecraft.

Shepherd will eventually decide what Minecraft needs using ownership, topology, Folia region pressure, MSPT, TPS, players, entities, loaded chunks, generation pressure, storage temperature, handoffs, and cross-cell traffic. A Runtime Provider will translate a compatible worker request into generic lifecycle operations.

```text
Shepherd -> Runtime Provider -> Native process, Docker container, or external infrastructure
```

Providers may report capacity and prepare, inspect, drain, or stop workers. They never assign cell ownership, advance an ownership epoch, move a player, split a cell, or write world state. A provider operation can succeed while an Elah ownership operation still fails closed.

The planned provider order is Native, Docker, then an authenticated External Provider for hosting panels, Kubernetes, cloud systems, and custom infrastructure. Kubernetes remains optional. Elah is not a container orchestrator, VM manager, billing platform, hosting panel, or general-purpose scheduler.

## Workload engines and shared substrate

Elah's primary architecture is the **Distributed World Engine**: one logical Minecraft world divided into cells, with authoritative ownership, ownership epochs, handoffs, boundary behavior, and distributed world consistency. This remains the only workload engine on the committed release roadmap.

The architecture reserves a future **Instance Fleet Engine** for whole, independent Minecraft server instances such as lobbies, minigame matches, or separate survival servers. Its scheduling unit would be an entire instance, not a cell. Independent instances would use lifecycle, placement, resource, port, proxy-registration, health, drain, restart, and demand evidence. They would not use cell ownership, ownership epochs, ghost state, or cross-cell simulation.

```text
                         elahd
                           |
                 small shared substrate
          hosts, capacity, lifecycle, health,
             admission, network, observability
                    /               \
                   /                 \
      Distributed World Engine    Instance Fleet Engine
            current focus        Future / Not Yet Implemented
                   |                       |
                 cells              whole instances
```

Only low-level capabilities with value to the current system belong in the shared substrate: host identity and discovery, capacity evidence, admission primitives, worker lifecycle, health, networking, and observability. Ownership, epochs, cell migration, player and entity handoff, and boundary simulation remain explicit Distributed World Engine concepts.

No common schedulable-workload type, class hierarchy, protocol, template system, minigame API, or instance autoscaler is reserved today. A future engine must earn any shared abstraction from concrete implementations and must not require a rewrite of the distributed-world model.

Instance Fleet Mode is distinct from Fleet Integration. Fleet Integration lets many isolated Elah clusters consume one infrastructure pool. Instance Fleet Mode would let one future Elah deployment schedule independent Minecraft server instances. The two may later coexist on shared machines only after resource isolation, identity, port, network, proxy, storage, and failure-domain policies are independently qualified.

## Elastic worker model

Future worker lifecycle states are:

| State | Meaning |
| --- | --- |
| COLD | No worker process exists. |
| WARM | A compatible runtime has joined the cluster but owns no authoritative cells. |
| HOT | The worker owns and serves one or more authoritative cells. |

A HOT worker can be stopped or reclaimed only after players and cells are drained and zero authoritative ownership is proven. Uncertain drain completion leaves the worker allocated.

Future capacity policy classes are GUARANTEED, BURST, and PREEMPTIBLE. These classes affect availability and placement, never ownership strength. Per-cluster resource envelopes bound workers, CPU, memory, storage, generation, network use, priority, preemptible eligibility, and warm capacity.

## Deployment scopes

Elah core operates one cluster as one ownership domain. A hosting provider may place many isolated clusters on a shared fleet through the provider boundary, but those clusters do not share controller authority, credentials, storage namespaces, networks, metrics, or ownership state.

Customer lifecycle, billing, fleet-wide inventory, and generic host allocation remain outside Elah. Tenant isolation is a qualification gate for future fleet integrations.

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

## Implemented read-only Observer

The `elah` Rust binary contains a separate read-only Observer path for offline Minecraft Java Anvil worlds. Its production parser owns the filesystem boundary, Anvil header and envelope validation, bounded decompression, schema-light NBT extraction, report aggregation, and two-pass consistency ledger. It rejects symbolic links and never opens an observed input with write capability.

Standard mode reads report-driving metadata, every region header, and every occupied chunk envelope. Deep mode additionally fingerprints and boundedly decodes complete chunk payload inputs. PrismarineJS is a development and CI oracle only: it creates and rereads fixtures independently, but it is not a production dependency or runtime authority. Observer does not assign ownership, repair data, write storage, route clients, simulate gameplay, or prove player activity.
