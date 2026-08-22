# Elah

> One world. Many machines. No giant required.

Elah is intended to become a distributed orchestration and ownership layer for Minecraft worlds. The planned system would not replace a Minecraft server, a proxy, or a database; it would coordinate authoritative world ownership across workers while retaining a normal Java-client experience.

Elah is at the beginning of its journey. **0.0.5 (Folia Baseline Laboratory) is a development-only functional compatibility gate, not a gameplay release.** It runs the existing 32-session client proof and both Observer modes against an exact disposable Folia fixture, then proves the stopped world is unchanged. Observer remains the current operator-useful command. See the [0.0.5 release gate](docs/releases/0.0.5-folia-baseline-laboratory.md), [Folia Baseline Laboratory guide](docs/development/folia-baseline-laboratory.md), and [Observer guide](docs/development/observer.md).

## Intended architecture

This diagram and its component descriptions are a future design target. Observer, Protocol Laboratory, and Client Laboratory are independent development surfaces. They do not implement this future runtime path.

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

The intended division of responsibility is that Folia would scale vertically within a worker while Elah would scale horizontally between workers. Generic infrastructure would manage processes, containers, VMs, and machines underneath Elah; Elah would make Minecraft-specific ownership and placement decisions. See [VISION.md](VISION.md), [ARCHITECTURE.md](ARCHITECTURE.md), [INVARIANTS.md](INVARIANTS.md), and [FAILURE_MODEL.md](FAILURE_MODEL.md) for the design contracts.

## Status

Folia Baseline Laboratory pins Folia 1.21.8 build 6 at commit `612d9bd8569fe1a6008a05325af3fad66ef1cef7` with Mineflayer 4.37.1. It requires 32 sessions in two sequential waves of 16, server-observed movement, clean Folia shutdown, standard and deep Observer reports, and an unchanged world proven by complete before and after hashes. Passing `elah.folia-baseline/v1` evidence is functional-only compatibility evidence. It does not prove performance, Folia region parallelism, Elah integration, ownership, handoff, gameplay, a playable cluster, or production readiness.

0.0.4 (Client Laboratory) remains the Paper-specific compatibility gate. Minecraft 26.2 is not qualified because upstream client support remains unresolved.

0.0.3 (Observer) remains a read-only world inspection release, not a gameplay release. Its `elah observe <world>` command reports saved world identity, dimensions, region and chunk counts, storage distribution, coordinate bounds, and source-labelled timestamps without modifying the selected world. Standard mode validates every terrain region header and occupied chunk envelope. `--deep` additionally decodes every occupied chunk within fixed resource limits. Both modes repeat discovery and evidence collection before returning a report; changed inputs fail closed.

## Contributing and security

The [Elah wiki](https://github.com/greyfoundry/elah/wiki) has separate starting points for [non-technical readers](https://github.com/greyfoundry/elah/wiki/For-everyone) and [technical readers](https://github.com/greyfoundry/elah/wiki/Technical-guide). Repository documentation remains the source for contributor procedures and exact engineering contracts.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before contributing and [SECURITY.md](SECURITY.md) to report a vulnerability privately.

For a local validation baseline, see [CI and local checks](docs/development/ci.md). Toolchain versions and installation checks are recorded in [Toolchains](docs/development/toolchains.md).

## Licensing

Original Elah work is licensed under Apache-2.0. The complete license text, file-notice policy, and module boundary are in [LICENSES.md](LICENSES.md). `java/elah-folia` is reserved for GPL-3.0-only derivative work if and when it contains Folia-derived code.
