# Contributing

Thanks for helping make Elah correct before making it ambitious.

## Ground rules

- Read [ARCHITECTURE.md](ARCHITECTURE.md), [INVARIANTS.md](INVARIANTS.md), [FAILURE_MODEL.md](FAILURE_MODEL.md), and relevant ADRs before proposing an architectural change.
- Keep the Folia/Elah boundary intact: Folia handles within-worker concurrency; Elah coordinates between workers.
- Prefer public Folia APIs, then a normal plugin, then a small upstreamable extension before proposing a patch.
- Treat upstream code as research material, not source to translate. Do not import or reference `studying/` from production code or builds.
- Keep normal gameplay off the control plane.
- Design state changes for retries, explicit epochs, traces, and failure recovery.

## AI-assisted contributions

AI-assisted code and other AI-assisted contributions are allowed, but the person submitting the change remains fully responsible for it. Assistance does not lower Elah's standards for correctness, security, licensing, provenance, testing, or reviewability.

Before submitting assisted work, the contributor must:

- Manually inspect every material change rather than relying on a generated summary or claimed test result.
- Understand the implementation and be able to explain its behaviour, design choices, trade-offs, and failure modes during review.
- Run the relevant checks personally and verify that the reported evidence came from the submitted revision.
- Check for fabricated APIs, insecure defaults, copied material, incompatible licenses, hidden dependencies, and unintended changes.
- Keep secrets, private infrastructure details, personal data, and restricted source material out of external services.
- Accept responsibility for correcting, maintaining, or withdrawing the contribution.

Maintainers may ask the contributor to explain or revise any part of a submission. A contribution may be closed if its submitter cannot demonstrate that they reviewed and understand it. Do not add generated-by notices, tool attribution, or automated authorship claims to source, documentation, commit messages, or release artifacts; the human submitter is the accountable author of record.

## Licensing and notices

Contributions to original Elah work are made under `Apache-2.0`. Every human-authored, comment-capable non-documentation file must begin with the complete branded notice below, translated only into the file's native comment syntax:

```text
# ╔══════════════════════════════════════════════════════════════════╗
# ║                                                                  ║
# ║                   ELAH | A GREYFOUNDRY PROJECT                   ║
# ║                                                                  ║
# ║               https://github.com/greyfoundry/elah                ║
# ║                                                                  ║
# ╚══════════════════════════════════════════════════════════════════╝
#
# Copyright © 2026 Greyfoundry contributors.
# SPDX-FileCopyrightText: 2026 Greyfoundry contributors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# SPDX-License-Identifier: Apache-2.0
#
```

Do not abbreviate this to two SPDX lines. If a format cannot safely carry an inline notice, add a precise annotation to `REUSE.toml`. Do not add notices to verbatim license texts or generated output. Code derived from Folia belongs in `java/elah-folia` and is `GPL-3.0-only`.

The banner must be the first syntactically valid line. A required shebang or XML declaration stays first and the notice follows immediately. Generated files, upstream wrapper files, strict data formats, binaries, and documentation use precise `REUSE.toml` annotations instead. CI enforces the complete notice, its position, Apache-2.0 identity, and REUSE 3.3 coverage.

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
