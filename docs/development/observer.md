# Observer

Observer is a read-only administrator tool for offline Minecraft Java Anvil worlds. It produces a complete report only after a second evidence pass matches the first. If report-driving data changes, it fails closed and produces no success report.

## Commands

```text
elah observe <world>
elah observe <world> --deep
elah observe <world> --format json
elah observe <world> --deep --format json --verbose
```

The default human format is intended for terminals. JSON success output is one `elah.observe/v1` document on stdout; progress notices use stderr. JSON failures use `elah.error/v1` on stderr and never emit a success schema. `--verbose` adds bounded technical details after the plain-language cause, trust consequence, and recovery action.

## Standard and deep cost

Standard mode inventories the safe regular-file tree, reads bounded saved metadata from `level.dat`, and validates every terrain region header and occupied chunk envelope. It reports counts, storage, timestamps, and bounds without decompressing chunk NBT.

`--deep` additionally reads and fingerprints every complete terrain region and external chunk input, decompresses every occupied terrain chunk, validates NBT, checks embedded coordinates, and reports saved data-version and status distributions. It costs more I/O, CPU, memory, and time. Prefer a filesystem snapshot, particularly for large worlds or any world that may still be open by a server.

## Hard limits

Observer applies these limits before accepting data into a report:

| Input | Limit |
| --- | ---: |
| Compressed `level.dat` | 16 MiB |
| Decompressed `level.dat` | 64 MiB |
| Compressed external chunk | 128 MiB |
| Decompressed chunk NBT | 128 MiB |
| Elements in one NBT list or array | 1,000,000 |
| Paths below the selected root | 1,000,000 |
| Changed paths shown by advanced details | 50 |

Limit violations, decompression failures, malformed NBT, invalid allocations, truncated envelopes, coordinate mismatches, and unsafe filesystem entries return an actionable failure instead of partial data.

## Exit behavior

| Exit | Meaning |
| ---: | --- |
| 0 | A complete, internally consistent report was written. |
| 2 | Command usage is invalid. |
| 3 | The selected path is not a supported world. |
| 4 | Input is unsafe or malformed, or a read-only filesystem operation failed. |
| 5 | The world changed; no report was produced. |

For exit 5, stop the server or create a filesystem snapshot and try again. Default output avoids exception, debug, and backtrace noise. Use `--verbose` when an operator or maintainer needs the affected paths or lower-level cause.

## Field provenance

| Report area | Source |
| --- | --- |
| Saved level name, data version, version name, `LastPlayed` | Bounded `level.dat` NBT |
| Dimension identifiers and kinds | Vanilla and namespaced dimension directory layout |
| Region and occupied-chunk counts | Validated Anvil headers and location entries |
| Region bytes and storage percentage | Safe regular-file metadata and checked aggregation |
| Chunk and block bounds | Occupied Anvil entries and checked coordinate conversion |
| Latest region timestamp | Nonzero Anvil header timestamps |
| Deep data-version and status distributions | Bounded schema-light chunk NBT |

Saved timestamps and filesystem modification times are metadata, not proof of player activity. Observer does not inspect player intent, gameplay events, session logs, or server audit data.

## Supported boundary

Observer supports Minecraft Java Edition Anvil `.mca` terrain regions, GZip `level.dat`, GZip/Zlib/uncompressed/Java-LZ4 chunk streams, and external `.mcc` chunks. Current and legacy nested chunk metadata layouts are normalized where their fields are available.

Legacy McRegion `.mcr`, symbolic links, paths escaping the selected root, special filesystem entries, live-snapshot coordination, Bedrock worlds, repairs, writes, locks, player-activity claims, Folia or Velocity integration, ownership, persistence services, failover, and production cluster validation are outside 0.0.3.

## Read-only evidence

Observed inputs are opened read-only. Standard mode fingerprints exactly the header, envelope, and metadata bytes that drive its report. Deep mode also fingerprints complete decoded-input files. The second pass repeats discovery and evidence collection; a mismatch returns exit 5. The GitHub `Observer Laboratory (standard, deep, immutable, fail-closed)` independently creates and rereads fixture truth with PrismarineJS and verifies complete before/after hashes.
