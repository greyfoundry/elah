# SPDX-FileCopyrightText: 2026 Greyfoundry contributors
# SPDX-License-Identifier: Apache-2.0 OR MIT

gradle := if os() == "windows" { "gradlew.bat" } else { "./gradlew" }

default: check

check: rust-check java-check node-check proto-check

rust-check:
    cargo fmt --check
    cargo clippy --workspace --all-targets --all-features -- -D warnings
    cargo test --workspace --all-targets --all-features --locked

java-check:
    {{gradle}} --no-daemon check

node-check:
    pnpm install --frozen-lockfile
    pnpm test

proto-check:
    buf lint proto
    buf build proto

proto-generate:
    pnpm proto:generate
