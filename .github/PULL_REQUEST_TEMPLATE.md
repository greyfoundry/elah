# Pull request

## Summary

<!-- What changed? Keep this concrete and user- or operator-visible where possible. -->

## Why

<!-- What problem, issue, invariant, or maintenance risk does this solve? -->

## Scope and risk

- Affected components:
- Compatibility impact:
- Data, protocol, threading, ownership, or persistence impact:
- Security impact:
- Rollback or recovery plan:

## Validation

<!-- List exact commands and results. Include negative and failure-path evidence where relevant. -->

| Check | Result |
| --- | --- |
| Focused tests | |
| Failure-path or negative tests | |
| `just check` | |
| `pnpm ci:check` | |
| `reuse lint` | |
| `git diff --check` | |

## Checklist

- [ ] The change is focused and linked to an issue or clearly explained above.
- [ ] Tests cover the changed behaviour and its realistic failure modes.
- [ ] Documentation, ADRs, manifests, and generated outputs are updated where required.
- [ ] New comment-capable non-documentation files start with the complete Greyfoundry Apache-2.0 notice.
- [ ] No secrets, private infrastructure data, study checkout content, or hidden authorship/tooling provenance are present.
- [ ] Dependency and license changes are identified and reviewable.
- [ ] Security-sensitive details are handled through a private repository security advisory, not this public PR.
