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

## Changes and validation

Keep changes focused, add tests appropriate to the failure mode, and explain any invariant affected. Before submitting, run the repository's relevant formatters, tests, licensing checks, and `git diff --check`. Never report a scenario as safe solely because a happy-path test passed: include negative and failure-path evidence where possible.

Use ADRs for consequential decisions. A new ElahFolia patch requires an ADR covering the problem, alternatives, exact upstream files, threading and persistence effects, tests, upgrade risk, and upstreaming potential.
