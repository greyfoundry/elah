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

set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

gradle := if os() == "windows" { ".\\gradlew.bat" } else { "./gradlew" }

default: check

check: rust-check java-check node-check proto-check

rust-check:
    cargo fmt --check
    cargo clippy --workspace --all-targets --all-features -- -D warnings
    cargo test --workspace --all-targets --all-features --locked

java-check:
    {{ gradle }} --no-daemon check

node-check:
    pnpm install --frozen-lockfile
    pnpm test

proto-check:
    buf lint proto
    buf build proto
    pnpm proto:check-generated

proto-generate:
    pnpm proto:generate

protocol-lab-build:
    cargo build --locked -p elahd
    {{ gradle }} --no-daemon :java:elah-dummy-worker:installDist

protocol-lab reconnects="2": protocol-lab-build
    node lab/protocol/run-laboratory.mjs --reconnects {{ reconnects }}

observer-lab:
    cargo build --locked -p elah-cli --bin elah
    pnpm lab:observer

client-lab report="build/reports/client-laboratory/report.json" java="java" paper_cache="build/cache/client-laboratory":
    pnpm lab:client -- --report "{{ report }}" --java "{{ java }}" --paper-cache "{{ paper_cache }}"

folia-lab report="build/reports/folia-baseline/report.json" java="java" elah=if os() == "windows" { "target/debug/elah.exe" } else { "target/debug/elah" } folia_cache="build/cache/folia-baseline":
    pnpm lab:folia -- --report "{{ report }}" --java "{{ java }}" --elah "{{ elah }}" --folia-cache "{{ folia_cache }}"
    pnpm verify:folia -- "{{ report }}"
