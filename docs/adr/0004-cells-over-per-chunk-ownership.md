# ADR 0004: Cells over per-chunk ownership

## Status

Accepted

## Context

Per-chunk multi-worker ownership permits fine movement but introduces frequent transitions and high cross-machine coherence complexity. Elah needs a safe first unit of horizontal ownership.

## Decision

Use contiguous cells as the ownership unit. A cell contains one or more storage-aligned tiles; the initial default is four by four tiles, or 128 by 128 chunks. This is configuration rather than protocol law. Tiles remain storage-aligned units, while cells remain ownership units.

## Consequences

Elah reduces ownership churn and boundary traffic relative to per-chunk coordination. Boundaries are coarser and future live migration may be larger, but split and merge remain possible only after measurements justify them. Ghost state stays read-only.

## Alternatives considered

- Per-chunk ownership: rejected for the first architecture because of coherence and transition complexity.
- One tile per cell: rejected because a 512-block ownership boundary would make handoffs too frequent.
- Very large permanent cells: rejected because migration cost would become unmanageable.
