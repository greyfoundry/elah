# Licensing

Original Elah work is available under either of these licenses, at the recipient's option:

- [Apache License 2.0](LICENSES/Apache-2.0.txt) (`Apache-2.0`)
- [MIT License](LICENSES/MIT.txt) (`MIT`)

SPDX expression: `Apache-2.0 OR MIT`.

## Folia-derived boundary

`java/elah-folia` is reserved for code derived from Folia. When that module first contains Folia-derived code, that code and the relevant module metadata must be licensed `GPL-3.0-only`; it is not covered by the dual-license grant above. A clean-room integration that does not contain Folia-derived code remains original Elah work until that boundary changes.

## File notices and generated assets

Human-authored non-documentation files carry first-line SPDX notices. Files for which an inline notice is unsuitable, including license texts, generated files, lockfiles, and binary assets, are annotated in [REUSE.toml](REUSE.toml). Do not remove or weaken a notice when moving a file.

Upstream source and checkouts are not development dependencies. They belong only in the ignored `studying/` area once that system is introduced, with their licenses recorded in the study manifest and notes.
