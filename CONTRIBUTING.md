# Contributing

Thanks for helping make Elah correct before making it ambitious.

## Ground rules

- Read [ARCHITECTURE.md](ARCHITECTURE.md), [INVARIANTS.md](INVARIANTS.md), [FAILURE_MODEL.md](FAILURE_MODEL.md), and relevant ADRs before proposing an architectural change.
- Keep the Folia/Elah boundary intact: Folia handles within-worker concurrency; Elah coordinates between workers.
- Prefer public Folia APIs, then a normal plugin, then a small upstreamable extension before proposing a patch.
- Treat upstream code as research material, not source to translate. Do not import or reference `studying/` from production code or builds.
- Keep normal gameplay off the control plane.
- Design state changes for retries, explicit epochs, traces, and failure recovery.

## Licensing and notices

Contributions to original Elah work are made under `Apache-2.0 OR MIT`. Put these first-line-compatible SPDX notices in every human-authored non-documentation file, using the native comment syntax:

```text
SPDX-FileCopyrightText: 2026 Greyfoundry contributors
SPDX-License-Identifier: Apache-2.0 OR MIT
```

If a format cannot safely carry an inline notice, add a precise annotation to `REUSE.toml`. Do not add those notices to the verbatim license texts. Code derived from Folia belongs in `java/elah-folia` and is `GPL-3.0-only`.

For a human-authored, non-documentation format that supports comments, the copyright notice must be the first syntactically valid line and the license identifier must immediately follow it. Generated files, upstream wrapper files, strict data formats, binaries, and documentation use precise `REUSE.toml` annotations instead. CI enforces both the header position and complete REUSE 3.3 coverage.

## Changes and validation

Keep changes focused, add tests appropriate to the failure mode, and explain any invariant affected. Before submitting, run the repository's relevant formatters, tests, licensing checks, and `git diff --check`. Never report a scenario as safe solely because a happy-path test passed: include negative and failure-path evidence where possible.

The complete local baseline is:

```sh
just check
pnpm ci:check
reuse lint
git diff --check
```

The study boundary permits only `studying/README.md` and `studying/manifest.lock` to be tracked. Production source, build inputs, packages, releases, dependency graphs, containers, and SBOM inputs must never reference an upstream checkout below `studying/`. Public files must also remain free of hidden authorship or tooling provenance markers.

CI runs Buf breaking detection against the event's base commit whenever that commit contains a Protobuf baseline. A repository with no base Protobuf files receives an explicit not-applicable notice for that first comparison only; the same job activates automatically as soon as a base commit contains Protobuf files.

Use ADRs for consequential decisions. A new ElahFolia patch requires an ADR covering the problem, alternatives, exact upstream files, threading and persistence effects, tests, upgrade risk, and upstreaming potential.
