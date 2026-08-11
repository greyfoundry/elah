# Roadmap

## 0.0.1 - Genesis

Genesis establishes the laboratory: monorepo foundations, licensing, ADRs, build and CI foundations, studying isolation, an upstream manifest, and public architecture documents. It is not released to server owners and ships **no gameplay feature**. Its exit gate is repeatable validation under pinned toolchains.

## 0.0.2 - Protocol Laboratory

Protocol Laboratory adds the first executable cross-language control path: a loopback-only Rust `elahd`, versioned Protocol Buffer and gRPC contracts, generated Rust/Java/TypeScript surfaces, and a Java dummy worker. Its release gate force-kills and reconnects worker sessions 25 times on a GitHub-hosted runner while asserting exact generations, monotonic heartbeats, and retired-session rejection. It still ships **no Minecraft integration or gameplay feature**.

## 0.0.3 - Observer

Observer adds the read-only `elah observe <world>` administrator command for Minecraft Java Anvil snapshots. Standard mode inventories safe files, dimensions, `level.dat`, region headers, and chunk envelopes. Optional deep mode boundedly decompresses and validates chunk NBT. Both modes use two-pass evidence and produce no report if report-driving data changes. A development-only PrismarineJS oracle independently creates and reads the release fixture, compares standard and deep reports, and proves complete file hashes remain unchanged. Observer still ships **no server integration, ownership, storage write, failover, repair, or gameplay feature**.

## 0.0.4 - Client Laboratory

Client Laboratory qualifies Mineflayer 4.37.1 with Minecraft 1.21.8 and Paper build 60. A real Paper server runs only as a disposable, loopback-only GitHub-hosted fixture. The gate requires `elah.client-laboratory/v1` evidence for 32 sessions in two sequential waves, exact lifecycle stages, server-observed movement, and clean Paper shutdown. Minecraft 1.21.11 is not qualified because hosted candidate evidence showed client-local movement that Paper did not accept. Minecraft 26.2 is also unqualified because upstream client support remains unresolved. This development-only release does not prove Folia, ownership, storage, failover, gameplay, a playable cluster, or production readiness. It adds no operator command.

## 0.0.5 - Folia Baseline Laboratory

Folia Baseline Laboratory pins Folia 1.21.8 build 6 at commit `612d9bd8569fe1a6008a05325af3fad66ef1cef7` with Mineflayer 4.37.1. The GitHub-hosted gate requires 32 sessions in two sequential waves of 16, server-observed movement, clean Folia shutdown, valid standard and deep Observer reports, and an unchanged stopped world proven by complete before and after hashes. Passing `elah.folia-baseline/v1` evidence is functional-only compatibility evidence. It does not prove performance, Folia region parallelism, Elah integration, ownership, handoff, gameplay, a playable cluster, or production readiness. It adds no operator command.

## Near-term sequence

The immediate path is intentionally narrow:

1. Run a single Folia worker and record a baseline using Observer and Client Laboratory evidence where applicable.
2. Introduce a second worker with static cells.
3. Demonstrate a fixed-boundary player handoff repeatedly without state loss or duplication.
4. Add ownership epochs, crash-safe transfer recovery, and runtime observability before broader scaling.

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

## Post-production research reservation: Instance Fleet Mode

**Future / Not Yet Implemented. No release number or date is assigned.**

After the Distributed World Engine is production-proven, Elah may evaluate a separate Instance Fleet Engine for scheduling whole independent Minecraft server instances across compatible machines. This is not part of 0.x, 1.x, 2.x, 3.x, or the Elah 4.0 completion gate.

Research may begin only when all of these entry conditions hold:

1. Static and dynamic distributed-world ownership are production-supported.
2. Cell handoff, fencing, recovery, drain, storage, and boundary behavior are qualified under failure.
3. Runtime Providers and resource envelopes have stable evidence from real deployments.
4. Concrete operators need whole-instance orchestration that existing providers do not already solve well enough.
5. Instance identity, ports, proxy registration, templates, secrets, storage, isolation, health, drain, restart, and autoscaling have an independent threat and failure model.

The future engine must not reuse cell ownership epochs, ghost boundaries, or distributed-world protocols for independent instances. It may share only proven low-level host, capacity, lifecycle, health, networking, admission, and observability primitives.

Elah will integrate with Kubernetes, Nomad, Pterodactyl, Pelican, or similar systems where they are the right infrastructure layer. It will not compete with them as a generic orchestrator or control panel.
