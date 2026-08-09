# Licensing

Original Elah work is licensed under the [Apache License 2.0](LICENSE) (`Apache-2.0`). This is the default license for Greyfoundry-authored Elah source, configuration, tests, and build logic. The same canonical text is stored at [LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt) for REUSE layout compliance.

## Folia-derived boundary

`java/elah-folia` is reserved for code derived from Folia. When that module first contains Folia-derived code, that code and the relevant module metadata must be licensed `GPL-3.0-only`; it is not covered by the Apache-2.0 grant above. A clean-room integration that does not contain Folia-derived code remains original Elah work until that boundary changes.

## File notices and generated assets

Every Greyfoundry-authored, comment-capable non-documentation file begins with the branded Elah/Greyfoundry banner, the complete Apache-2.0 short-form notice, a copyright line, and the standard SPDX copyright and Apache-2.0 license tags, rendered in the file's native comment syntax. A required shebang or XML declaration may precede the notice so the file remains executable or syntactically valid. CI compares this complete notice exactly; a two-line SPDX-only header is not sufficient.

Files for which an inline notice is unsuitable—including verbatim license texts, generated files, strict data formats, lockfiles, and binary assets—are annotated precisely in [REUSE.toml](REUSE.toml). Documentation is exempt from embedded headers and is covered there as well. Upstream-authored files retain their original notices and provenance. Do not remove, shorten, replace, or weaken a notice when moving a file.

Upstream source and checkouts are not development dependencies. They belong only in ignored paths within `studying/`, with their licenses recorded in the study manifest and notes.
