# ADR 0008: Defer Instance Fleet Mode behind a separate workload engine

## Status

Accepted

## Context

Elah's primary purpose is to make one logical Minecraft world use several workers and machines. Its scheduling unit is a cell, and its safety model requires authoritative ownership, ownership epochs, player and entity handoff, distributed world consistency, and boundary behavior.

A different Minecraft scaling pattern runs many independent server instances such as lobbies, minigame matches, dungeons, or separate survival servers. The unit of placement is a complete process and world. Lifecycle, resource allocation, ports, identity, proxy registration, health, drain, restart, and demand-based scaling matter, but cell ownership and distributed simulation do not.

Existing systems validate that whole-instance scheduling is a distinct problem. Kubernetes schedules Pods to Nodes. Nomad places task allocations on nodes. Agones manages warm GameServer fleets, allocation, packed or distributed placement, templates, health, and fleet autoscaling. Pterodactyl and Pelican manage isolated game-server containers. Folia, by contrast, maintains independently ticking regions and region-local ownership inside one Minecraft server process.

Forcing both models through one early scheduler or workload abstraction would mix different consistency and failure semantics. Ignoring the second model completely could create avoidable coupling in host and lifecycle infrastructure.

## Decision

Elah reserves a future Instance Fleet Engine, clearly marked **Future / Not Yet Implemented**. The Distributed World Engine remains the only workload engine on the committed release roadmap and remains Elah's core priority.

The control plane may share a deliberately small substrate where the capability has present value:

- host identity and discovery;
- capacity evidence and resource reservations;
- admission and placement primitives;
- process or container lifecycle;
- health evidence and crash observation;
- networking primitives;
- observability.

Distributed-world semantics remain specialized above that substrate: cells, authoritative ownership, epochs, migrations, ghost boundaries, world consistency, and player or entity handoff.

The future Instance Fleet Engine would schedule complete independent Minecraft instances. It would own instance identity, lifecycle, placement, ports, proxy registration, templates, health, drain, restart, and demand policy. It would not use cell ownership or distributed-world protocols.

No common `SchedulableWorkload` hierarchy, public fleet API, template model, minigame system, or instance autoscaler is introduced now. Shared abstractions are extracted only from concrete, production-proven needs.

Instance Fleet Mode is distinct from Fleet Integration. Fleet Integration is many isolated Elah clusters using one infrastructure pool. Instance Fleet Mode is one future workload engine managing independent Minecraft instances.

The roadmap assigns no version or date. Evaluation waits until the Distributed World Engine, Runtime Providers, isolation, and failure handling are production-proven and concrete operator demand exists.

## Consequences

- Current runtime and protocol work stays unchanged.
- The distributed-world model remains explicit and easy to reason about.
- Host, capacity, lifecycle, health, networking, admission, and observability can become stable extension points when current work needs them.
- A future instance engine can reuse proven substrate without inheriting cell semantics.
- Coexistence on shared machines remains possible only after independent resource, identity, network, port, storage, proxy, and failure-domain qualification.
- Elah continues to rely on Kubernetes, Nomad, hosting panels, and providers for generic infrastructure rather than competing with them.

## Alternatives considered

### Build Instance Fleet Mode now

Rejected. It would delay the differentiated distributed-world path and add templates, ports, proxy registration, demand models, and tenant concerns before the ownership model is proven.

### Generalize every scheduler concept now

Rejected. A hypothetical hierarchy would hide materially different safety semantics and create abstractions without implementation evidence.

### Treat independent instances as very large cells

Rejected. Whole independent servers have no shared world authority, ownership epochs, ghost boundaries, or cross-cell simulation. Reusing those concepts would be misleading and unsafe.

### Leave no architectural reservation

Rejected. A small, explicit separation prevents host and lifecycle infrastructure from becoming unnecessarily coupled to cells while preserving the current roadmap.

## Evidence

- [Kubernetes scheduler](https://kubernetes.io/docs/concepts/scheduling-eviction/kube-scheduler/)
- [Nomad scheduling model](https://developer.hashicorp.com/nomad/docs/concepts/scheduling/how-scheduling-works)
- [Agones Fleet specification](https://www.agones.dev/site/docs/reference/fleet/)
- [Agones FleetAutoscaler specification](https://agones.dev/site/docs/reference/fleetautoscaler/)
- [Pterodactyl introduction](https://pterodactyl.io/project/introduction.html)
- [Pelican project overview](https://pelican.dev/)
- [Folia overview](https://docs.papermc.io/folia/reference/overview/)
- [Folia region logic](https://docs.papermc.io/folia/reference/region-logic/)
