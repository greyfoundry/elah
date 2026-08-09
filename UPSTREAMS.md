# Upstreams and research boundaries

Elah learns from upstream projects without importing their source into production work. Research is repeatable from exact pins, scoped, and documented.

| Upstream | Intended study | Boundary |
| --- | --- | --- |
| Folia | Regionised simulation concurrency and threading rules. | Use public APIs first; keep ElahFolia patches thin and separately governed. |
| Velocity | Player-facing proxy behavior and gateway integration. | Sling handles routing and handoff control, not gameplay ownership. |
| C2ME | A concurrency field guide for scheduling, chunk I/O, world generation, and unsafe assumptions. | Study concepts independently; do not copy, port, or import source. C2ME OpenCL material is explicitly research-only. |
| MultiPaper | Trade-offs of fine-grained multi-server single-world ownership. | Elah uses coarser cells initially to avoid per-chunk coherence complexity. |
| PrismarineJS ecosystem | Independent protocol, world, chunk, Anvil, NBT, physics, and bot validation. | An oracle and second opinion, not unquestionable truth or a production runtime dependency. |

## Studying isolation

Upstream checkouts live only under ignored paths within `studying/`; the tracked manifest and study notes record repository, organisation, branch or tag, exact commit, date, license, purpose, and related ADRs. Production source, builds, packages, release archives, containers, and SBOMs must never resolve dependencies from studying checkouts.

Every upstream study should produce a research note that records the problem, architecture, useful ideas, rejected ideas, incompatible assumptions, experiments, benchmarks, licensing implications, and resulting ADRs.
