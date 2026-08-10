# ADR 0007: Read-only Observer

## Status

Accepted for Elah 0.0.3.

## Context

Elah needs factual evidence about existing Minecraft Java worlds before any future ownership, storage, or handoff work can be evaluated. That evidence must not depend on a running server, modify the selected world, silently accept changing inputs, or turn a development oracle into a production runtime dependency.

## Decision

Implement Observer as one Rust binary, `elah`, with two explicit depths:

- Standard performs a complete structural scan of safe world paths, bounded `level.dat` metadata, every Anvil region header, and every occupied chunk envelope.
- Bounded deep mode repeats the standard boundary, fingerprints full decoded inputs, and decompresses and parses every occupied chunk using fixed limits.

The production implementation owns its Anvil envelope parser. It uses mature Rust NBT and compression libraries for GZip, Zlib, uncompressed NBT, and Java LZ4-block streams. PrismarineJS remains an independent development-only oracle that creates and rereads fixtures and compares known truth with both Rust reports.

Both depths use a two-pass evidence ledger. Observer repeats world discovery and report-driving evidence after scanning. Any added, removed, modified, redirected, or identity-changing input fails closed with no partial report. Symbolic links (symlinks) are rejected because they prevent proof of the read boundary.

Production Observer code contains no write-capable handle for observed inputs. Fixture creation and intentional mutation are confined to tests and the laboratory. The successful JSON contract is `elah.observe/v1`; errors use a separate envelope and never masquerade as a successful report.

## Consequences

Standard scans are cheaper and explicitly do not claim chunk NBT validation. Deep scans cost more I/O, CPU, memory, and time, but validate complete bounded payloads and saved metadata distributions. Neither depth repairs data, interprets gameplay semantics, proves player activity, assigns ownership, or validates a live server snapshot without external snapshot coordination.
