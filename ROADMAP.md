# Roadmap

## 0.0.1 — Genesis

Genesis establishes the laboratory: monorepo foundations, licensing, ADRs, build and CI foundations, studying isolation, an upstream manifest, and public architecture documents. It is not released to server owners and ships **no gameplay feature**. Its exit gate is repeatable validation under pinned toolchains.

## 0.0.2 — Protocol Laboratory

Protocol Laboratory adds the first executable cross-language control path: a loopback-only Rust `elahd`, versioned Protocol Buffer and gRPC contracts, generated Rust/Java/TypeScript surfaces, and a Java dummy worker. Its release gate force-kills and reconnects worker sessions 25 times on a GitHub-hosted runner while asserting exact generations, monotonic heartbeats, and retired-session rejection. It still ships **no Minecraft integration or gameplay feature**.

## 0.0.3 — Observer

Observer adds the read-only `elah observe <world>` administrator command for Minecraft Java Anvil snapshots. Standard mode inventories safe files, dimensions, `level.dat`, region headers, and chunk envelopes. Optional deep mode boundedly decompresses and validates chunk NBT. Both modes use two-pass evidence and produce no report if report-driving data changes. A development-only PrismarineJS oracle independently creates and reads the release fixture, compares standard and deep reports, and proves complete file hashes remain unchanged. Observer still ships **no server integration, ownership, storage write, failover, repair, or gameplay feature**.

## Near-term sequence

The immediate path is intentionally narrow:

1. Add a separate protocol-aware laboratory client without coupling it to production code.
2. Run a single Folia worker and record a baseline using Observer evidence where applicable.
3. Introduce a second worker with static cells.
4. Demonstrate a fixed-boundary player handoff repeatedly without state loss or duplication.
5. Add ownership epochs, crash-safe transfer recovery, and runtime observability before broader scaling.

## Later directions

The dependency order is locked even though release dates are not.

### 1.x: Safe static multi-machine Minecraft

The 1.x train proves static cells, player and entity handoff, ownership epochs, crash recovery, worker drain, boundary awareness, storage, generation, capacity evidence, rolling upgrades, and control-plane high availability.

Elah 1.0 is the first production-supported target: one logical Minecraft deployment across several workers using static spatial ownership. It does not include dynamic placement, elastic workers, or automatic failover.

### 2.0 through 2.3: Minecraft-aware dynamic placement

Shepherd gains live cell migration, measured placement recommendations, optional automatic placement, cell split and merge, and operator placement constraints.

This work must prove that Elah can safely change ownership before Elah is allowed to create or remove infrastructure capacity.

### 2.4 through 2.9: Runtime Providers and elastic workers

| Release | Direction |
| --- | --- |
| 2.4 | Runtime Provider contract and conformance laboratory. |
| 2.5 | Native elastic workers on operator-managed machines. |
| 2.6 | Optional Docker worker lifecycle. |
| 2.7 | COLD, WARM, and HOT pools plus GUARANTEED, BURST, and PREEMPTIBLE capacity. |
| 2.8 | Hard resource envelopes and authenticated External Provider integrations. |
| 2.9 | Qualification of many isolated clusters sharing one heterogeneous infrastructure pool. |

Kubernetes, hosting panels, cloud systems, and custom provisioners remain optional adapters below the provider boundary. Elah does not become a hosting panel, billing platform, VM manager, or general-purpose container scheduler.

### 2.10 through 2.14: Advanced single-region operation

Predictive prefetch, regenerative storage, advanced Stone, boundary simulation, and published scale qualification follow elastic-worker safety. These releases must continue to preserve one authoritative owner and one epoch per cell.

### 3.x: Geographic operation

Geographic Sling, latency-aware placement, cross-region handoff, replicated Stone, disaster recovery, global directories, cross-region plugin primitives, and mature security are a later major-version track.

### 4.0: Mature product target

The mature target combines safe ownership, dynamic placement, elastic workers, advanced storage, geographic operation, plugin contracts, observability, security, rolling maintenance, and optional infrastructure integrations while retaining normal Minecraft Java clients.

Dynamic repartitioning, autoscaling, multi-region operation, custom clients, GPU world generation, and a Kubernetes requirement are not early work. Runtime Provider concepts may inform earlier interface design, but provider orchestration cannot enter an earlier milestone.

The mature aim remains one logical Minecraft world across many workers while retaining vanilla Java clients. This roadmap is directional, not a promise of release dates.
