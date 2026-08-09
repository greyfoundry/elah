# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's [private vulnerability reporting](https://github.com/greyfoundry/elah/security/advisories/new) with a clear description, affected revision, reproduction or proof of concept where safe, impact, and any suggested mitigation. Please avoid publishing details until a coordinated fix and advisory plan exist.

Public issues may use the security-hardening form only for non-sensitive defense-in-depth suggestions that do not expose an exploitable weakness, bypass, secret, private infrastructure detail, or sensitive proof of concept.

## Supported versions

Elah is pre-release software. Security fixes currently target the latest revision of `main`; no released version is supported for production deployment yet.

## What to include

- The affected component, revision, and deployment conditions.
- The security impact and a realistic attack scenario.
- Minimal reproduction steps or a proof of concept, shared privately and without unrelated sensitive data.
- Known mitigations, workarounds, and evidence that the issue is not already fixed on `main`.
- A safe contact method if coordination requires follow-up.

## Security posture

Only the Velocity-facing Minecraft port is intended to be internet-facing. Management APIs, worker and controller RPC, Stone endpoints, administrative credentials, certificate authorities, world uploads and backups, and plugin-management surfaces belong on private or local networks by default.

At maturity, component-to-component communication uses mutual TLS. Worker enrollment uses one-time enrollment tokens and issued worker identities rather than a permanent shared cluster password. Administrative operations should be authenticated, authorised, auditable, and deliberate.

## Engineering expectations

- Treat ownership fencing, transfer idempotency, and storage verification as security-relevant correctness controls.
- Do not place secrets in source, fixtures, issues, or documentation.
- Keep dependencies reviewable and record their licenses.
- Prefer signed artifacts, checksums, SBOMs, published source commits, dependency audits, and pinned-toolchain build verification for releases.
- Do not add an opaque curl-pipe-shell installer.

This policy will gain a project contact and supported-version table before the first server-owner release.
