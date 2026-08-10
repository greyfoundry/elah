# Elah

> One world. Many machines. No giant required.

Elah is intended to become a distributed orchestration and ownership layer for Minecraft worlds. The planned system would not replace a Minecraft server, a proxy, or a database; it would coordinate authoritative world ownership across workers while retaining a normal Java-client experience.

Elah is at the beginning of its journey. **0.0.3 (Observer) is a read-only world inspection release, not a gameplay release.** It adds `elah observe <world>` for deterministic structural reports over offline Minecraft Java Anvil worlds, with an optional bounded deep scan. Observer does not provide a runnable Minecraft cluster or playable distributed world. See the [0.0.3 release gate](docs/releases/0.0.3-observer.md) and [Observer guide](docs/development/observer.md).

## Intended architecture

This diagram and its component descriptions are a future design target. Observer is independent of this future runtime path; Protocol Laboratory implements only the `elahd`-to-dummy-worker control connection.

```text
Minecraft client -> Velocity / Sling -> ElahFolia workers
                                      ^
                                      |
                                    elahd
```

- **Folia** is planned as the within-machine regionised simulation runtime.
- **Elah** is planned to coordinate ownership and distribution between machines.
- **Sling** is planned as the Velocity gateway integration for routing and handoffs.
- **Stone** is planned to provide world-storage services.
- **Shepherd** is planned as the placement and workload scheduler in `elahd`.
- **Brook** is planned to coordinate generation and pregeneration.

The intended division of responsibility is that Folia would scale vertically within a worker while Elah would scale horizontally between workers. See [ARCHITECTURE.md](ARCHITECTURE.md), [INVARIANTS.md](INVARIANTS.md), and [FAILURE_MODEL.md](FAILURE_MODEL.md) for the design contracts.

## Status

Observer reports saved world identity, dimensions, region and chunk counts, storage distribution, coordinate bounds, and source-labelled timestamps without modifying the selected world. Standard mode validates every terrain region header and occupied chunk envelope. `--deep` additionally decodes every occupied chunk within fixed resource limits. Both modes repeat discovery and evidence collection before returning a report; changed inputs fail closed. Folia workers, Mineflayer clients, multi-worker handoff, storage, ownership epochs, failover, repair, and gameplay remain future work.

## Contributing and security

The [Elah wiki](https://github.com/greyfoundry/elah/wiki) has separate starting points for [non-technical readers](https://github.com/greyfoundry/elah/wiki/For-everyone) and [technical readers](https://github.com/greyfoundry/elah/wiki/Technical-guide). Repository documentation remains the source for contributor procedures and exact engineering contracts.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before contributing and [SECURITY.md](SECURITY.md) to report a vulnerability privately.

For a local validation baseline, see [CI and local checks](docs/development/ci.md). Toolchain versions and installation checks are recorded in [Toolchains](docs/development/toolchains.md).

## Licensing

Original Elah work is licensed under Apache-2.0. The complete license text, file-notice policy, and module boundary are in [LICENSES.md](LICENSES.md). `java/elah-folia` is reserved for GPL-3.0-only derivative work if and when it contains Folia-derived code.
