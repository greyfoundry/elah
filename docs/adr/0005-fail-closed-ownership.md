# ADR 0005: Fail closed on uncertain ownership

## Status

Accepted

## Context

Network partitions and delayed health signals can make a living worker look unavailable. Reassigning its cell prematurely can create two writers and irreversible world divergence.

## Decision

When ownership is uncertain, do not automatically reassign the cell. Every ownership-sensitive write carries an epoch; stale epochs are rejected loudly. Automatic failover is deferred until Stone can provide authoritative storage-level fencing that physically rejects stale epochs.

## Consequences

Elah may choose temporary unavailability over availability during partitions. Operators receive an explicit failure state rather than a silent split-brain. Recovery procedures and tests must make fencing behavior visible.

## Alternatives considered

- Reassign after a timeout: rejected because a partitioned former owner may still write.
- Reconcile conflicting writes later: rejected because Minecraft world conflicts are not safely mergeable in general.
- Trust worker heartbeats alone: rejected because heartbeats cannot prove a partitioned worker has stopped writing.
