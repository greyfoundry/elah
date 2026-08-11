# Client Laboratory

Client Laboratory is Elah's development-only real-server compatibility gate. It qualifies Mineflayer 4.37.1 with Minecraft 1.21.8 and Paper build 60. It does not add an operator command or a production client path.

## What the hosted gate does

GitHub Actions downloads the exact Paper object over HTTPS, rejects redirects, enforces a 64 MiB maximum, and verifies SHA-256 before atomically publishing the executable JAR into the job workspace. The JAR and generated world are disposable. They are not committed, cached across trust boundaries, packaged, or attached to a release.

The fixture accepts the Paper EULA only for that ephemeral CI run. Paper binds to `127.0.0.1`, uses a dynamic port, and enables offline authentication only inside the isolated loopback fixture. No Minecraft account credentials are used.

The gate starts a real Paper server and runs 32 sessions in two sequential waves of 16. Every client uses a unique `elah_lab_NNN` username. Directions repeat deterministically as forward, right, back, and left. The second wave cannot begin until all sessions in the first wave have ended.

Mineflayer 4.37.1 omits three protocol details required by this Minecraft 1.21.8 fixture: it does not send `player_loaded` after spawn, its high-level control setter does not send the complete `player_input` direction state, and its physics loop does not finish emitted movement packets with `tick_end`. [Paper build 60's packet listener](https://github.com/PaperMC/Paper/blob/29c8822/paper-server/patches/sources/net/minecraft/server/network/ServerGamePacketListenerImpl.java.patch) keeps the player in its not-loaded state until `player_loaded` arrives or its bounded fallback timeout expires. The session adapter therefore marks the spawned client loaded, mirrors the selected single direction into a complete input state, and completes every emitted movement tick. This narrow compatibility adapter is covered by packet-order tests and remains laboratory-only. The input and tick shims can be removed after equivalents of [PrismarineJS/mineflayer#3949](https://github.com/PrismarineJS/mineflayer/pull/3949) and [PrismarineJS/mineflayer#3948](https://github.com/PrismarineJS/mineflayer/pull/3948) ship in a separately reviewed and pinned Mineflayer release. The load acknowledgement can be removed after the pinned Mineflayer dependency provides the matching behavior.

## Evidence contract

A passing report uses schema `elah.client-laboratory/v1`. Every session must contain these exact stages in order:

```text
created
connected
logged_in
spawned
server_position_before
movement_requested
server_position_after
disconnect_requested
ended
```

Both positions are read from Paper console `data get entity` results. Mineflayer-local coordinates are never accepted as movement authority. The horizontal server-observed movement must be at least 0.5 blocks. A pass also requires two complete waves, all 32 complete sessions, a requested Paper stop, and exit code zero.

Failures use schema `elah.client-laboratory-error/v1`. The report includes a stable error kind, a bounded human-readable summary, the pinned compatibility tuple, and bounded Paper diagnostics. It does not replace the failure with a generic success-shaped report. Client peers are asked to disconnect after the first failure, and Paper cleanup is still attempted.

## Commands

Unit and boundary tests are safe to run locally:

```sh
pnpm test:client
```

The full real-server gate is intentionally hosted because it downloads and runs Paper and can use substantial workstation resources:

```sh
pnpm lab:client -- --report build/reports/client-laboratory/report.json
```

The CLI accepts only `--report`, `--java`, and `--paper-cache`. Session count, wave count, versions, Paper URL, checksum, timeouts, and resource limits are code-pinned and cannot be overridden from CI input.

## Qualification boundary

Minecraft 1.21.11 is not qualified because hosted candidate evidence showed Mineflayer moving 8.375 blocks locally while Paper observed 0.000 blocks of horizontal displacement. Minecraft 26.2 is also unqualified because upstream client support remains unresolved. A later version requires its own pinned tuple and evidence before it can replace 1.21.8.

This laboratory does not prove Folia, ownership, placement, storage, failover, gameplay, a playable cluster, or production readiness. It proves only the bounded Mineflayer-to-Paper lifecycle and server-observed movement described above.
