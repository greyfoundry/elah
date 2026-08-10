# Elah

> One world. Many machines. No giant required.

Elah is intended to become a distributed orchestration and ownership layer for Minecraft worlds. The planned system would not replace a Minecraft server, a proxy, or a database; it would coordinate authoritative world ownership across workers while retaining a normal Java-client experience.

Elah is at the beginning of its journey. **0.0.2 (Protocol Laboratory) is a control-plane experiment, not a gameplay release.** It provides a loopback-only Rust gRPC controller, a Java dummy worker, and a CI-hosted forced-reconnect exercise. It does not provide a runnable Minecraft cluster or playable distributed world. See the [0.0.2 release gate](docs/releases/0.0.2-protocol-laboratory.md) and [laboratory guide](docs/development/protocol-laboratory.md).

## Intended architecture

This diagram and its component descriptions are a future design target. The Protocol Laboratory implements only the `elahd`-to-dummy-worker control connection.

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

Protocol Laboratory demonstrates versioned registration, sequenced heartbeats, deterministic session replacement, and rejection of retired sessions across a real Rust-to-Java gRPC connection. Its GitHub-hosted release gate force-kills 26 worker processes to prove an initial connection plus 25 reconnects. Folia workers, Mineflayer clients, multi-worker handoff, storage, ownership epochs, failover, and gameplay remain future work.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before contributing and [SECURITY.md](SECURITY.md) to report a vulnerability privately.

For a local validation baseline, see [CI and local checks](docs/development/ci.md). Toolchain versions and installation checks are recorded in [Toolchains](docs/development/toolchains.md).

## Licensing

Original Elah work is licensed under Apache-2.0. The complete license text, file-notice policy, and module boundary are in [LICENSES.md](LICENSES.md). `java/elah-folia` is reserved for GPL-3.0-only derivative work if and when it contains Folia-derived code.
