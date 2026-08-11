# Folia Baseline Laboratory

Folia Baseline Laboratory is Elah's development-only functional compatibility gate for one exact Folia fixture. It composes the already-qualified client lifecycle with the read-only Observer and complete stopped-world hashing. It does not add an operator command or a production Folia integration path.

## Exact fixture

The qualified tuple is fixed in source:

```text
Folia: 1.21.8 build 6
Commit: 612d9bd8569fe1a6008a05325af3fad66ef1cef7
Artifact: folia-1.21.8-6.jar
Bytes: 53064151
SHA-256: 233843cfd5001b6f658fcab549178d694cc37f0277d004ea295de0a94c57278f
Mineflayer: 4.37.1
Minecraft: 1.21.8
```

The identity comes from [PaperMC build metadata](https://fill.papermc.io/v3/projects/folia/versions/1.21.8/builds/6). The download must use HTTPS, return no redirect, match the published byte count, remain within 64 MiB, and match the pinned SHA-256 before execution. The JAR, EULA acceptance, configuration, world, and process root exist only for the job. They are not committed, uploaded, cached across trust boundaries, or attached to a release.

Folia itself groups nearby loaded chunks into independently ticking regions. The upstream [Folia architecture overview](https://github.com/PaperMC/Folia#overview) explains that model. This laboratory deliberately does not measure or assert that parallel behavior.

## Ordered gate

The hosted gate performs these operations in order:

1. Download and verify the exact Folia artifact.
2. Bind the disposable fixture to loopback with offline authentication and a dynamic port.
3. Run 32 unique Mineflayer sessions in two sequential waves of 16.
4. Require every session to complete the exact lifecycle and server-observed movement.
5. Request clean Folia shutdown and require exit code zero with no signal.
6. Hash every regular world file with framed relative path, length, and complete content digest evidence.
7. Run standard Observer and require `content_nbt_decoded` to be false.
8. Run deep Observer and require `content_nbt_decoded` to be true.
9. Hash the stopped world again and require the entire canonical snapshot to be unchanged.
10. Write nested artifacts, independently verify their SHA-256 references, and publish the final report last.
11. Remove the disposable process root before a passing report can be emitted.

Observer never runs until the client evidence proves clean Folia shutdown. A client, process, Observer, hash, cleanup, publication, or verification failure blocks success.

## Evidence bundle

Passing evidence uses schema `elah.folia-baseline/v1` and references these sibling artifacts:

```text
report.json
client-report.json
observer-standard.json
observer-deep.json
world-before.json
world-after.json
folia.log
```

The final report records the exact compatibility tuple, artifact identity, environment, clean server lifecycle, 32-session summary, both Observer modes, before and after world roots, nested artifact digests, and diagnostic durations. `verify-report.mjs` rereads bounded regular files and recomputes every nested digest instead of trusting the summary.

Failures use `elah.folia-baseline-error/v1`. The public error contains a stable kind, the failed phase, and a short plain-language summary such as `Observed world changed during the stopped-world integrity window`. Technical output remains in the bounded `folia.log` reference for readers who need the details. A failure envelope cannot be verified as a pass.

## Commands

Focused tests are safe to run locally:

```sh
pnpm test:folia
```

The full gate can use substantial CPU and memory. GitHub-hosted CI is authoritative:

```sh
cargo +1.97.1 build --locked -p elah-cli --bin elah
pnpm lab:folia -- --report build/reports/folia-baseline/report.json
pnpm verify:folia -- build/reports/folia-baseline/report.json
```

The runner accepts only `--report`, `--java`, `--elah`, and `--folia-cache`. Versions, artifact identity, 32-session shape, timeouts, memory bounds, and integrity limits cannot be overridden from workflow input.

## Qualification boundary

This is functional-only compatibility evidence for one exact tuple. It proves that the bounded 32-session lifecycle completed, Folia shut down cleanly, both Observer modes accepted the stopped world, and Observer left every hashed world byte unchanged.

It does not prove performance, Folia region parallelism, Elah integration, ownership, handoff, placement, storage, failover, gameplay, a playable cluster, plugin compatibility, or production readiness. Any later Folia, Minecraft, or Mineflayer version requires a separately pinned and reviewed evidence run.
