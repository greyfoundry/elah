# Toolchains

Use the pinned toolchain inputs below when preparing a local contributor environment. The repository wrappers and lockfiles are part of the contract; do not replace them with globally installed alternatives when validating a change.

| Component | Required version | Repository source |
| --- | --- | --- |
| Rust | 1.97.1, with `clippy` and `rustfmt` | `rust-toolchain.toml` |
| Java | Temurin 25 | CI configuration |
| Gradle | 9.7.0 | Gradle wrapper |
| Node.js | 24.19.0 | `.node-version` |
| pnpm | 10.34.5 | `package.json` |
| Buf | 1.72.0 | CI configuration |
| Google Java Format | 1.36.1 | CI Java job downloads the Maven Central all-dependencies JAR and verifies its SHA-256 |
| Python | 3.13 | CI licensing job |
| REUSE | 6.2.0 | CI licensing job installs `reuse==6.2.0` with pip |

Rust Protocol Buffer compilation uses `protoc-bin-vendored` 3.2.0, so a system `protoc` installation is not required.

## Prepare a checkout

From the repository root, confirm the available versions:

```sh
rustc --version
cargo --version
java --version
node --version
pnpm --version
buf --version
python --version
python -m reuse --version
```

Run the Gradle wrapper rather than a system Gradle installation:

```sh
./gradlew --version
```

On Windows, use `gradlew.bat --version` instead. The `justfile` selects that wrapper automatically for its Java check.

Install Node dependencies with the committed lockfile:

```sh
pnpm install --frozen-lockfile
```

For the same licensing tool used by CI, install and run the pinned REUSE release with Python 3.13:

```sh
python -m pip install reuse==6.2.0
reuse lint
```

CI obtains Google Java Format 1.36.1 from Maven Central in its Java job, verifies the downloaded JAR by SHA-256, and uses it in dry-run mode. CI sets up Python 3.13 in its licensing job, installs `reuse==6.2.0`, and then runs `reuse lint`.

The project does not require a Minecraft server, proxy, cluster, database, or gameplay workload for the Protocol Laboratory validation gate. Those runtime environments belong to later stages and are not represented as a local setup requirement here.

## Verify the environment

Run the commands in [CI and local checks](ci.md). The aggregate repository check is:

```sh
just check
```

It runs Rust formatting, linting, and tests; the Gradle `check` task; Node tests; and Buf lint, build, and generated-output validation.
