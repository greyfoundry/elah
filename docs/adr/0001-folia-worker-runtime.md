# ADR 0001: Folia worker runtime

## Status

Accepted

## Context

Elah needs efficient simulation within each Minecraft worker without taking ownership of Minecraft's internal scheduler. A broad server fork would multiply maintenance and upgrade risk.

## Decision

Use Folia as the worker runtime. Folia owns within-machine regionised simulation concurrency; Elah coordinates ownership only between workers. ElahFolia remains a thin integration and follows the public API, plugin, upstreamable extension, minimal-patch escalation order.

## Consequences

Elah benefits from Folia's concurrency model while avoiding a second scheduler. Plugin and integration code must obey Folia's region rules. Any ElahFolia patch needs a dedicated ADR and a tracked patch budget.

## Alternatives considered

- Fork and substantially rewrite the server: rejected because maintenance cost and threading risk would dominate the project.
- Use a conventional single-threaded runtime: rejected because it abandons the required within-machine concurrency foundation.
- Implement a parallel scheduler beside Folia: rejected because competing schedulers would blur responsibility and risk correctness.
