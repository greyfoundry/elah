# Elah

> One world. Many machines. No giant required.

Elah is a distributed orchestration and ownership layer for Minecraft worlds. It does not replace a Minecraft server, a proxy, or a database. It coordinates authoritative world ownership across workers while retaining a normal Java-client experience.

Elah is at the beginning of its journey. **0.0.1 (Genesis) is a laboratory foundation, not a gameplay release.** It establishes project contracts, build foundations, and research boundaries; it implements no gameplay behavior and does not provide a runnable Minecraft cluster or playable distributed world. See the [Genesis release gate](docs/releases/0.0.1-genesis.md) for the demonstrated scope and [development setup](docs/development/toolchains.md) for the local entrypoint.

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

Genesis establishes the laboratory only. The roadmap's Folia workers, Mineflayer laboratory client, multi-worker handoff, chaos exercises, storage services, and soak testing are future work, not Genesis capabilities. The intended fixed-boundary experiment is a later engineering target; it has not been demonstrated by this release.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before contributing and [SECURITY.md](SECURITY.md) to report a vulnerability privately.

For a local validation baseline, see [CI and local checks](docs/development/ci.md). Toolchain versions and installation checks are recorded in [Toolchains](docs/development/toolchains.md).

## Licensing

Original Elah work is dual-licensed under Apache-2.0 or MIT at your option. The complete license texts and module boundary are in [LICENSES.md](LICENSES.md). `java/elah-folia` is reserved for GPL-3.0-only derivative work if and when it contains Folia-derived code.
