# Roadmap

## 0.0.1 — Genesis

Genesis establishes the laboratory: monorepo foundations, licensing, ADRs, build and CI foundations, studying isolation, an upstream manifest, and public architecture documents. It is not released to server owners and ships **no gameplay feature**. Its exit gate is reproducible builds.

## Near-term sequence

The immediate path is intentionally narrow:

1. Establish Rust, Gradle, Node, Protocol Buffers, and CI foundations.
2. Build dummy control-plane and worker components and a Mineflayer laboratory client.
3. Run a single Folia worker and record a baseline.
4. Introduce a second worker with static cells.
5. Demonstrate a fixed-boundary player handoff repeatedly without state loss or duplication.
6. Add ownership epochs, crash-safe transfer recovery, and observability before broader scaling.

## Later directions

Stone storage, Brook generation, Shepherd placement, entity handoff, boundary awareness, static multi-worker operation, richer recovery, and operator tooling follow only after the fixed-boundary foundation is boringly reliable. Dynamic repartitioning, autoscaling, multi-region operation, custom clients, GPU world generation, and a Kubernetes requirement are not early work.

The mature aim remains one logical Minecraft world across many workers while retaining vanilla Java clients. This roadmap is directional, not a promise of release dates.
