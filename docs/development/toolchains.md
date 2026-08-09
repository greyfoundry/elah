# Toolchains

Use the pinned toolchain inputs below when preparing a local contributor environment. The repository wrappers and lockfiles are part of the contract; do not replace them with globally installed alternatives when validating a change.

| Component | Required version | Repository source |
| --- | --- | --- |
| Rust | 1.97.1, with `clippy` and `rustfmt` | `rust-toolchain.toml` |
| Java | Temurin 25 | CI configuration |
| Gradle | 9.6.1 | Gradle wrapper |
| Node.js | 24.19.0 | `.node-version` |
| pnpm | 10.34.5 | `package.json` |
| Buf | 1.72.0 | CI configuration |

## Prepare a checkout

From the repository root, confirm the available versions:

```sh
rustc --version
cargo --version
java --version
node --version
pnpm --version
buf --version
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

The project does not require a Minecraft server, proxy, cluster, database, or gameplay workload for the Genesis validation gate. Those runtime environments belong to later stages and are not represented as a local setup requirement here.

## Verify the environment

Run the commands in [CI and local checks](ci.md). The aggregate repository check is:

```sh
just check
```

It runs Rust formatting, linting, and tests; the Gradle `check` task; Node tests; and Buf lint, build, and generated-output validation.
