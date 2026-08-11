# CI and local checks

Continuous integration validates the repository foundation, Protocol Laboratory, read-only Observer, development-only Client Laboratory, and development-only Folia Baseline Laboratory. It checks source quality, declared boundaries, generated artifacts, supply-chain metadata, cross-language worker lifecycle, independent world-report evidence, and bounded Mineflayer lifecycles against exact disposable server fixtures. It does not run a Minecraft cluster or demonstrate gameplay behavior.

## Local baseline

Run these commands from the repository root before submitting a change:

```sh
just check
pnpm ci:check
reuse lint
git diff --check
```

`just check` runs the component checks below:

| Command | Coverage |
| --- | --- |
| `cargo fmt --check` | Rust formatting |
| `cargo clippy --workspace --all-targets --all-features -- -D warnings` | Rust linting |
| `cargo test --workspace --all-targets --all-features --locked` | Rust tests |
| `./gradlew --no-daemon check` | Java compilation and tests configured by Gradle |
| `pnpm test` | Node tests, manifests, generated output, and repository scanner tests |
| `buf lint proto` and `buf build proto` | Protocol Buffers linting and build validation |
| `pnpm proto:check-generated` | Generated Protocol Buffers manifest validation |

On Windows, use `gradlew.bat --no-daemon check` when running the Gradle command directly.

`pnpm ci:check` runs the public scanner set directly:

- `pnpm ci:check-studying` enforces the boundary around upstream-study material.
- `pnpm ci:check-provenance` scans public files for disallowed provenance markers.
- `pnpm ci:check-licenses` checks the complete Greyfoundry Apache-2.0 notice and its required placement for files that support inline notices.
- `pnpm ci:check-text-policy` rejects U+2014 in every tracked file byte stream.
- `pnpm ci:check-client-docs` checks the exact Client Laboratory qualification claims and non-goals.
- `pnpm ci:check-folia-docs` checks the exact Folia Baseline Laboratory qualification claims and non-goals.

The generated-output gate runs pinned Buf generation into a clean temporary directory and compares the complete generated Java and JavaScript/TypeScript trees byte for byte with checked-in output. The committed hash manifest is an additional integrity check, not the source of truth for freshness.

The Java CodeQL job disables Gradle's build cache and performs a clean compilation so the CodeQL extractor always observes source compilation instead of receiving only restored class outputs.

`reuse lint` verifies REUSE licensing coverage. Documentation is covered through the Markdown annotation in `REUSE.toml`, so Markdown files do not carry embedded SPDX notices.

## Protocol Laboratory

GitHub-hosted CI is authoritative for the full 25-reconnect gate. A smaller local exercise is optional:

```sh
just protocol-lab 2
```

That command builds `elahd` and the Java worker distribution, then exercises two reconnects on loopback. See [Protocol Laboratory](protocol-laboratory.md) for its evidence model and scope.

## Hosted checks

GitHub Actions runs the same Rust, Java, Node, Buf, manifest/generated-output, studying-boundary, public-provenance, and licensing checks on pushes and pull requests to `main`.

The hosted Java job downloads Google Java Format 1.36.1 from Maven Central, verifies the downloaded JAR by SHA-256, and checks Java formatting in dry-run mode. Run that formatter before submitting Java changes; the Gradle `check` task does not replace this formatting gate.

The hosted licensing job sets up Python 3.13, installs `reuse==6.2.0` with pip, and runs `reuse lint`. Use those exact versions when reproducing the licensing gate locally; see [Toolchains](toolchains.md).

Additional hosted gates are:

- Buf breaking-change comparison when the event base commit contains Protocol Buffer files.
- Dependency review for pull requests, configured to fail on moderate-or-higher severity findings.
- CodeQL analysis for Java/Kotlin and JavaScript/TypeScript.
- An SPDX JSON SBOM generated and retained as a CI artifact.
- The `Protocol Laboratory (25 reconnects)` job, with its JSON report retained as an artifact.
- The `Observer Laboratory (standard, deep, immutable, fail-closed)` job, with its report and comparison JSON retained as an artifact.
- The `Client Laboratory (32 sessions, server-observed movement)` job, with its bounded JSON report and Paper log retained as artifacts.
- The `Folia Baseline Laboratory (32 sessions, Observer immutable)` job, with its verified JSON evidence bundle and bounded Folia log retained as artifacts.

## Observer Laboratory

Run the focused local gate with:

```text
just observer-lab
```

This builds only the `elah` CLI, creates a temporary world outside the repository with the pinned PrismarineJS development oracle, compares standard and deep reports, verifies complete before/after file hashes, runs the synchronized changed-world CLI harness, writes reports only after all assertions pass, and removes the temporary world. See [Observer](observer.md) for the operator boundary and evidence model.

## Client Laboratory

Unit and boundary tests run as part of `pnpm test`. The full real-server gate stays independent from aggregate local checks and runs only in its GitHub-hosted job:

```text
pnpm test:client
pnpm lab:client -- --report build/reports/client-laboratory/report.json
```

The hosted job uses Temurin 21, Node 24.19.0, pnpm 10.34.5, Mineflayer 4.37.1, Minecraft 1.21.8, and Paper build 60. Passing `elah.client-laboratory/v1` evidence requires 32 sessions in two sequential waves, server-observed movement, and clean Paper shutdown. Minecraft 1.21.11 is not qualified because hosted candidate evidence showed client-local movement that Paper did not accept. Minecraft 26.2 is also unqualified because upstream client support remains unresolved.

This development-only gate does not prove Folia, ownership, storage, failover, gameplay, a playable cluster, or production readiness. See [Client Laboratory](client-laboratory.md) for the complete safety and evidence contract.

## Folia Baseline Laboratory

The full Folia gate stays independent from aggregate local checks because it downloads and runs a real server fixture:

```text
pnpm test:folia
cargo +1.97.1 build --locked -p elah-cli --bin elah
pnpm lab:folia -- --report build/reports/folia-baseline/report.json
pnpm verify:folia -- build/reports/folia-baseline/report.json
```

The hosted job uses Temurin 21, Node 24.19.0, pnpm 10.34.5, Rust 1.97.1, Folia 1.21.8 build 6 at commit `612d9bd8569fe1a6008a05325af3fad66ef1cef7`, and Mineflayer 4.37.1. It requires 32 sessions in two sequential waves of 16, server-observed movement, clean Folia shutdown, standard and deep Observer reports, and an unchanged world proven by complete before and after hashes. Passing `elah.folia-baseline/v1` evidence is functional-only compatibility evidence.

This gate does not prove performance, Folia region parallelism, Elah integration, ownership, handoff, gameplay, a playable cluster, or production readiness. See [Folia Baseline Laboratory](folia-baseline-laboratory.md) for the full contract.

Some hosted gates depend on pull-request or GitHub Actions context and cannot be fully reproduced by the local commands. A passing local baseline therefore establishes repository checks only; it does not replace those hosted checks or prove a runtime deployment.
