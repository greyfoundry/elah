# Elah vision

> Generic infrastructure manages machines. Elah manages Minecraft.

Elah is intended to become a domain-specific distributed runtime and orchestrator for Minecraft Java. Its purpose is to make one logical world use several workers and machines while retaining normal clients and protecting authoritative world state.

This is a future architecture. Elah 0.0.4 adds a development-only Client Laboratory while Observer remains the operator-useful surface. The release does not provide a playable distributed cluster, dynamic placement, or elastic workers.

## The Kubernetes comparison

Kubernetes is useful as an analogy because it has a control plane, schedules workloads onto nodes, applies placement constraints, and can work with infrastructure autoscalers. Kubernetes documentation describes Pods being matched to Nodes and node autoscalers provisioning or consolidating generic capacity based on workload and node constraints.

Elah uses a similar separation of concerns, but its decisions depend on Minecraft state that a generic orchestrator should not be expected to understand.

| Generic infrastructure concept | Elah concept |
| --- | --- |
| Node | Machine |
| Pod or process | Worker |
| Scheduler | Shepherd |
| Control plane | `elahd` |
| Service routing | Sling |
| Persistent storage | Stone |
| Workload autoscaling | Elastic workers |
| Health probes | Minecraft-aware health evidence |
| Rolling update or eviction | Worker drain and cell migration |
| Resource requests | Cluster resource envelope |
| Affinity constraints | Cell placement constraints |
| Infrastructure autoscaler | Runtime Provider |

The comparison ends at workload meaning. Generic infrastructure sees containers, CPU, memory, networks, storage, health, and nodes. Elah must see Folia regions, MSPT, TPS, players, entities, chunks, world-generation pressure, cell ownership, ownership epochs, handoffs, storage temperature, and cross-cell traffic.

Kubernetes is not failing when it cannot decide which Minecraft cell should move. Being generic is its job. Elah is valuable because it can specialize.

## The architecture boundary

Elah decides what Minecraft needs. A Runtime Provider materializes compatible worker capacity.

```text
                 Elah
      Minecraft-aware decisions
                   |
                   v
            Runtime Provider
                   |
       +-----------+-----------+
       v           v           v
     Native      Docker     External
                               |
                     hosting panels, Kubernetes,
                       cloud, or custom systems
```

Generic infrastructure may start a process, container, VM, or Pod. Elah decides whether a cell should move, whether movement would help, which ownership epoch is current, how neighbouring state is prepared, and how players and entities cross the boundary safely.

The provider never assigns authoritative ownership. Elah never becomes a general container scheduler, VM manager, cloud provider, billing platform, or hosting panel.

## Two primary use cases

### One cluster across several machines

An individual community can add compatible machines to one Elah cluster. Shepherd can eventually place different cells on different workers according to simulation pressure and topology.

This is most promising for naturally spread workloads such as exploration, survival worlds, factions, Earth worlds, large borders, many independent bases, and distributed generation.

### Many isolated clusters over one provider fleet

A host can eventually expose spare capacity to many independent Elah clusters through the same provider contract. Each cluster keeps separate ownership authority, credentials, storage, networks, metrics, and resource envelopes.

This can support capacity policies such as:

- guaranteed capacity reserved for a cluster;
- burst capacity drawn from a shared ceiling;
- preemptible capacity that may be reclaimed only after a safe drain.

Elah supplies Minecraft-aware cluster decisions. A separate hosting or fleet layer remains responsible for customers, billing, generic machine inventory, and provider-wide allocation.

## Future independent server fleets

**Future / Not Yet Implemented**

Elah may eventually add an Instance Fleet Engine for whole independent Minecraft servers such as lobbies, minigame matches, dungeons, or separate survival instances. That engine would place and operate complete instances across compatible machines. It would not divide those instances into cells or treat them as parts of one distributed simulation.

This capability is intentionally deferred. The Distributed World Engine is Elah's core differentiator and must be proven in production before a second workload engine receives a release number. Existing work may share small host, capacity, lifecycle, health, network, admission, and observability primitives when those primitives improve the distributed-world system on their own merits.

The reservation does not turn Elah into a hosting panel or a generic scheduler. Accounts, billing, generic container orchestration, and provider-wide machine management stay outside the project boundary. Agones demonstrates that whole game-server fleets have useful concepts such as warm instances, allocation, placement strategies, templates, health, and demand-driven autoscaling. Elah should learn from that evidence later without copying Kubernetes into its core or mixing instance lifecycle with cell ownership.

## Why total CPU is not enough

A worker can have moderate total CPU utilization while one Folia region exceeds its tick budget. Another worker can have high CPU utilization even though moving a cell would increase boundary traffic and make gameplay worse.

Shepherd must combine Minecraft evidence with runtime constraints:

- Folia region MSPT and tick pressure;
- TPS and worker MSPT;
- players, entities, and loaded chunks per cell;
- generation queues and storage pressure;
- handoff rate, adjacency, and cross-cell traffic;
- CPU, memory, garbage collection, disk, and network pressure;
- compatibility, fault domains, capacity class, and operator constraints.

Scaling is therefore a topology decision before it is an infrastructure request.

## Honest limits

Elah cannot make weak hardware infinitely fast. Several machines help only when useful work can be separated without excessive coordination.

A dense lobby, one giant mob farm, one small combat arena, or another tightly coupled hotspot may remain limited by local simulation. Cell split and boundary protocols can improve some cases, but distributed coordination has a cost.

Every future capacity claim must publish its hardware, world, settings, plugins, workload, measurements, and failure evidence. Elah will not promise universal player counts or savings.

## Decisions locked by this vision

1. Elah remains Minecraft-specific.
2. Folia handles concurrency inside a worker; Elah coordinates between workers.
3. Generic lifecycle systems remain below the Runtime Provider boundary.
4. Provider order is Native, Docker, then External integrations.
5. Kubernetes remains optional and never becomes an Elah requirement.
6. Workers use COLD, WARM, and HOT lifecycle states.
7. Capacity uses GUARANTEED, BURST, and PREEMPTIBLE policy classes.
8. Resource envelopes are hard scheduling constraints, not billing logic.
9. A provider can supply capacity but can never assign cell ownership.
10. Multi-tenant fleet integration cannot weaken single-cluster isolation or ownership invariants.
11. Elastic work starts only after safe static operation and dynamic migration are proven.
12. One cell, one authoritative owner, and one epoch remains the central invariant.
13. The Distributed World Engine remains the only workload engine on the committed roadmap.
14. Instance Fleet Mode is a post-production research reservation with no assigned release.
15. Shared substrate abstractions must improve current distributed-world work before they are introduced.

## References

- [Kubernetes scheduler](https://kubernetes.io/docs/concepts/scheduling-eviction/kube-scheduler/)
- [Kubernetes node autoscaling](https://kubernetes.io/docs/concepts/cluster-administration/node-autoscaling/)
- [Kubernetes resource bin packing](https://kubernetes.io/docs/concepts/scheduling-eviction/resource-bin-packing/)
- [Agones Fleet specification](https://www.agones.dev/site/docs/reference/fleet/)
- [Agones FleetAutoscaler specification](https://agones.dev/site/docs/reference/fleetautoscaler/)
- [Nomad scheduling model](https://developer.hashicorp.com/nomad/docs/concepts/scheduling/how-scheduling-works)
- [Folia region logic](https://docs.papermc.io/folia/reference/region-logic/)
- [Elah architecture](ARCHITECTURE.md)
- [Elah invariants](INVARIANTS.md)
- [Elah roadmap](ROADMAP.md)
