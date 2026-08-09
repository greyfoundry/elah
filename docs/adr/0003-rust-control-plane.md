# ADR 0003: Rust control plane

## Status

Accepted

## Context

Elah requires a focused daemon for membership, topology, ownership, epochs, placement, and administration. It must coordinate workers without hosting ordinary gameplay.

## Decision

Implement `elahd` and the primary `elah` management tooling in Rust. Use Protocol Buffers, gRPC, and TLS for control-plane communication, with explicit request identity, deadlines, protocol versions, cluster identity, and ownership fencing inputs.

## Consequences

The control plane has a language and runtime suited to an explicit, observable systems boundary. Rust, Java, and TypeScript changes remain coordinated in the monorepo. `elahd` cannot be used as a shortcut for movement, entity, inventory, or chunk traffic.

## Alternatives considered

- Put cluster control inside every worker: rejected because it muddies authority and recovery boundaries.
- Implement the control plane in the proxy: rejected because player routing and ownership administration have different failure and scaling characteristics.
- Use a custom binary protocol first: rejected because gRPC and Protocol Buffers provide the needed typed, evolvable foundation without novel transport risk.
