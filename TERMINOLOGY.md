# Terminology

Use these terms consistently. Minecraft and Folia already use “region”, so Elah uses different words for its distributed abstractions.

| Term | Meaning |
| --- | --- |
| **Chunk** | Standard Minecraft 16 by 16 block horizontal unit; not an Elah abstraction. |
| **Tile** | Storage-aligned unit, initially one Anvil region coordinate: 32 by 32 chunks (512 by 512 blocks). |
| **Cell** | Elah ownership unit containing one or more tiles. The initial default is 4 by 4 tiles, or 128 by 128 chunks (2048 by 2048 blocks); that default is configuration, not protocol law. |
| **Worker** | One ElahFolia Minecraft server process. A machine may run multiple workers, although initial deployments should use one per machine. |
| **Cluster** | All Elah components in one administrative deployment. |
| **World** | A Minecraft world. |
| **Dimension** | Overworld, Nether, End, or a plugin-provided equivalent. |
| **Cell map** | The authoritative mapping from a cell to its worker and ownership epoch. |
| **Ghost state** | Read-only replicated neighbouring-cell state for boundary rendering or interactions; it is never authoritative. |
| **Ownership epoch** | Monotonically advancing fencing value attached to a cell assignment. |
| **Handoff** | Idempotent transfer of a player between workers. |

Do not call a cell a “region”, a tile a “shard”, or ghost state a copy with write authority.
