# Terminology

Use these terms consistently. Minecraft and Folia already use “region”, so Elah uses different words for its distributed abstractions.

| Term | Meaning |
| --- | --- |
| **Chunk** | Standard Minecraft 16 by 16 block horizontal unit; not an Elah abstraction. |
| **Tile** | Storage-aligned unit, initially one Anvil region coordinate: 32 by 32 chunks (512 by 512 blocks). |
| **Cell** | Elah ownership unit containing one or more tiles. The initial default is 4 by 4 tiles, or 128 by 128 chunks (2048 by 2048 blocks); that default is configuration, not protocol law. |
| **Worker** | One ElahFolia Minecraft server process. A machine may run multiple workers, although initial deployments should use one per machine. |
| **Machine** | A physical or virtual host that can run one or more workers. Generic infrastructure owns machine lifecycle. |
| **Cluster** | All Elah components in one administrative deployment. |
| **World** | A Minecraft world. |
| **Dimension** | Overworld, Nether, End, or a plugin-provided equivalent. |
| **Cell map** | The authoritative mapping from a cell to its worker and ownership epoch. |
| **Ghost state** | Read-only replicated neighbouring-cell state for boundary rendering or interactions; it is never authoritative. |
| **Ownership epoch** | Monotonically advancing fencing value attached to a cell assignment. |
| **Handoff** | Idempotent transfer of a player between workers. |
| **Shepherd** | The Minecraft-aware placement scheduler inside `elahd`. |
| **Runtime Provider** | A future adapter that reports capacity and performs generic worker lifecycle operations without receiving cell-ownership authority. |
| **COLD worker** | A worker allocation with no running process. |
| **WARM worker** | A compatible running worker that has joined its cluster but owns no authoritative cells. |
| **HOT worker** | A running worker that owns and serves at least one authoritative cell. |
| **GUARANTEED capacity** | Capacity reserved for a cluster and expected to remain available. |
| **BURST capacity** | Shared spare capacity available up to an explicit cluster ceiling. |
| **PREEMPTIBLE capacity** | Opportunistic capacity that may be reclaimed only after safe drain proves zero ownership. |
| **Resource envelope** | Hard per-cluster scheduling limits for workers and infrastructure resources; it is not a billing model. |
| **Fleet integration** | Many isolated Elah clusters consuming a shared infrastructure pool through provider boundaries. It is not a shared ownership domain. |

Do not call a cell a “region”, a tile a “shard”, or ghost state a copy with write authority.
