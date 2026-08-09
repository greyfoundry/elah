# Failure model

Elah assumes processes, disks, and networks fail independently and that messages can be delayed, duplicated, reordered, or lost. It does not assume exactly-once delivery, reliable health signals, or a graceful shutdown.

## Ownership uncertainty

A worker that loses contact with `elahd` may be partitioned rather than dead. While ownership is uncertain, Elah fails closed: do not reassign the cell and do not create a second writer. Only storage-level epoch fencing can make later automatic failover safe.

## Stale writers

Every ownership-sensitive write carries its epoch. A stale epoch is rejected and recorded; it is not silently reconciled. This turns a potential corruption event into an actionable failure.

## Transfer failures

Transfers are retryable operations keyed by a transfer ID and player version. If a target fails before activation, the source resumes. If the source fails before commit, the target never activates stale state. If the source fails after commit but before cleanup, the target owns the committed version. Duplicate completion messages are no-ops; a recovered old source is fenced.

## Migration failures

Cell migration progresses through planned, target prepared, base copied and verified, source quiescing, final delta verified, epoch commit, target active, source cleanup, and complete. Rollback is allowed before epoch commit. After it, recovery moves forward so crash recovery has one deterministic outcome.

## Storage failures

An authoritative source is retained until a replacement is durably copied, checksummed, manifested, independently verified, and optionally restore-tested. Disk-full, read-only, slow, corrupt-cache, unavailable-storage, and interrupted-snapshot cases are first-class test scenarios.

## Operational response

`SIGKILL` of workers, controllers, and Velocity; network partitions; packet delay, duplication, and reordering; and storage faults are expected chaos scenarios. Each scenario must assert the invariants, preserve a traceable record, and prefer temporary unavailability to split-brain or silent state loss.
