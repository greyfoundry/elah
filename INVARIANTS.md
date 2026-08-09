# Invariants

These invariants outrank throughput, uptime, and convenience. A release that violates one is broken regardless of TPS.

1. **One authoritative owner.** Every active `(world, dimension, cell)` has exactly one authoritative worker at a specific ownership epoch.
2. **Stale writers fail loudly.** A worker with an old epoch must have a write rejected as stale ownership; it must never write into a disagreement discovered later.
3. **No automatic failover before fencing is safe.** Uncertain ownership is not reassigned merely because a worker appears unavailable. Automatic reassignment requires authoritative storage-level fencing that can reject stale epochs.
4. **Player transfers are idempotent.** Transfers use a stable `transfer_id` and monotonically increasing player version. At-least-once transport is expected; duplicate effects are not.
5. **Never delete an authoritative copy before proving the replacement.** Stone follows copy, durable sync, checksum, manifest, independent verification, optional restore test, then only optionally source deletion.
6. **Control-plane traffic never carries ordinary gameplay.** `elahd` does not process movement, block breaks, inventory clicks, entity ticks, or chunk packets.
7. **Vanilla clients remain clients.** Players need no mod, launcher, infrastructure resource pack, or custom protocol extension to join an Elah cluster.

Any design, implementation, test, or operational procedure that challenges an invariant needs an ADR and an explicit safety case before it can proceed.
