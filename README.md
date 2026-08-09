# Elah

> One world. Many machines. No giant required.

Elah is a distributed orchestration and ownership layer for Minecraft worlds. It does not replace a Minecraft server, a proxy, or a database. It coordinates authoritative world ownership across workers while retaining a normal Java-client experience.

Elah is at the beginning of its journey. **0.0.1 (Genesis) is a laboratory foundation, not a gameplay release.** It establishes project contracts, build foundations, and research boundaries; it does not ship a playable distributed world.

## Architecture at a glance

```text
Minecraft client -> Velocity / Sling -> ElahFolia workers
                                      ^
                                      |
                                    elahd
```

- **Folia** provides within-machine regionised simulation concurrency.
- **Elah** coordinates ownership and distribution between machines.
- **Sling** is the Velocity gateway integration for routing and handoffs.
- **Stone** will provide world-storage services.
- **Shepherd** is the placement and workload scheduler in `elahd`.
- **Brook** will coordinate generation and pregeneration.

The central rule is simple: Folia scales vertically within a worker; Elah scales horizontally between workers. See [ARCHITECTURE.md](ARCHITECTURE.md), [INVARIANTS.md](INVARIANTS.md), and [FAILURE_MODEL.md](FAILURE_MODEL.md).

## Status

The first engineering target is deliberately small: two Folia processes, one pregenerated world, one Velocity proxy, and a fixed coordinate boundary crossed repeatedly without losing or duplicating player state. Dynamic placement, distributed storage, autoscaling, custom clients, and gameplay features are explicitly out of scope for Genesis.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before contributing and [SECURITY.md](SECURITY.md) to report a vulnerability privately.

## Licensing

Original Elah work is dual-licensed under Apache-2.0 or MIT at your option. The complete license texts and module boundary are in [LICENSES.md](LICENSES.md). `java/elah-folia` is reserved for GPL-3.0-only derivative work if and when it contains Folia-derived code.
