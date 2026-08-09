# CI and local checks

Continuous integration validates the Genesis foundation. It checks source quality, declared boundaries, generated artifacts, and supply-chain metadata; it does not run a Minecraft cluster or demonstrate gameplay behavior.

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

The generated-output gate runs pinned Buf generation into a clean temporary directory and compares the complete generated tree byte for byte with the checked-in Java output. The committed hash manifest is an additional integrity check, not the source of truth for freshness.

`reuse lint` verifies REUSE licensing coverage. Documentation is covered through the Markdown annotation in `REUSE.toml`, so Markdown files do not carry embedded SPDX notices.

## Hosted checks

GitHub Actions runs the same Rust, Java, Node, Buf, manifest/generated-output, studying-boundary, public-provenance, and licensing checks on pushes and pull requests to `main`.

The hosted Java job downloads Google Java Format 1.36.1 from Maven Central, verifies the downloaded JAR by SHA-256, and checks Java formatting in dry-run mode. Run that formatter before submitting Java changes; the Gradle `check` task does not replace this formatting gate.

The hosted licensing job sets up Python 3.13, installs `reuse==6.2.0` with pip, and runs `reuse lint`. Use those exact versions when reproducing the licensing gate locally; see [Toolchains](toolchains.md).

Additional hosted gates are:

- Buf breaking-change comparison when the event base commit contains Protobuf files.
- Dependency review for pull requests, configured to fail on moderate-or-higher severity findings.
- CodeQL analysis for Java/Kotlin and JavaScript/TypeScript.
- An SPDX JSON SBOM generated and retained as a CI artifact.

Some hosted gates depend on pull-request or GitHub Actions context and cannot be fully reproduced by the local commands. A passing local baseline therefore establishes repository checks only; it does not replace those hosted checks or prove a runtime deployment.
