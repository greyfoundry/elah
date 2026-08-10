# CI and local checks

Continuous integration validates the repository foundation and Protocol Laboratory. It checks source quality, declared boundaries, generated artifacts, supply-chain metadata, and the cross-language worker lifecycle; it does not run a Minecraft cluster or demonstrate gameplay behavior.

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

Some hosted gates depend on pull-request or GitHub Actions context and cannot be fully reproduced by the local commands. A passing local baseline therefore establishes repository checks only; it does not replace those hosted checks or prove a runtime deployment.
