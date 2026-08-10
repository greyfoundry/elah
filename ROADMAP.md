# Roadmap

## 0.0.1 — Genesis

Genesis establishes the laboratory: monorepo foundations, licensing, ADRs, build and CI foundations, studying isolation, an upstream manifest, and public architecture documents. It is not released to server owners and ships **no gameplay feature**. Its exit gate is repeatable validation under pinned toolchains.

## 0.0.2 — Protocol Laboratory

Protocol Laboratory adds the first executable cross-language control path: a loopback-only Rust `elahd`, versioned Protocol Buffer and gRPC contracts, generated Rust/Java/TypeScript surfaces, and a Java dummy worker. Its release gate force-kills and reconnects worker sessions 25 times on a GitHub-hosted runner while asserting exact generations, monotonic heartbeats, and retired-session rejection. It still ships **no Minecraft integration or gameplay feature**.

## Near-term sequence

The immediate path is intentionally narrow:

1. Add a separate protocol-aware laboratory client without coupling it to production code.
2. Run a single Folia worker and record a baseline.
3. Introduce a second worker with static cells.
4. Demonstrate a fixed-boundary player handoff repeatedly without state loss or duplication.
5. Add ownership epochs, crash-safe transfer recovery, and observability before broader scaling.

## Later directions

Stone storage, Brook generation, Shepherd placement, entity handoff, boundary awareness, static multi-worker operation, richer recovery, and operator tooling follow only after the fixed-boundary foundation is boringly reliable. Dynamic repartitioning, autoscaling, multi-region operation, custom clients, GPU world generation, and a Kubernetes requirement are not early work.

The mature aim remains one logical Minecraft world across many workers while retaining vanilla Java clients. This roadmap is directional, not a promise of release dates.
