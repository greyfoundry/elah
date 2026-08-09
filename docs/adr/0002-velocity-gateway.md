# ADR 0002: Velocity gateway

## Status

Accepted

## Context

Players need a normal Minecraft Java connection path and controlled backend switching during worker handoffs. Elah must not turn the control plane into a gameplay proxy.

## Decision

Use Velocity as the player-facing proxy runtime and implement Sling as its Elah gateway integration. Sling selects initial workers, resolves coordinates, orchestrates idempotent handoffs, switches backends, retries safely, routes maintenance traffic, and emits handoff observability.

## Consequences

Vanilla clients retain a standard proxy connection path. Sling must not become authoritative for gameplay state; ownership remains with the current worker and control decisions remain with `elahd`.

## Alternatives considered

- Make `elahd` proxy all client traffic: rejected because it violates the control-plane invariant and creates a per-tick bottleneck.
- Build a new player proxy: rejected because it expands scope without evidence that Velocity cannot satisfy the gateway role.
- Have workers independently redirect clients: rejected because it weakens coordinated, traceable handoff recovery.
