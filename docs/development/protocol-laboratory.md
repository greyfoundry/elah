# Protocol Laboratory

The laboratory connects the Rust `elahd` process to a Java dummy worker over plaintext loopback gRPC. It exists to validate contract compatibility and worker-session lifecycle behavior before any Minecraft runtime is introduced.

Run a small local exercise with:

```shell
just protocol-lab 2
```

The runner starts `elahd`, creates an initial worker session, records a heartbeat, force-kills the process, and repeats with fresh session IDs. After the requested reconnects it tries the original session again and requires a `FAILED_PRECONDITION` rejection. A passing JSON report is written to `build/reports/protocol-laboratory/report.json`.

Use `pnpm lab:protocol -- --reconnects N --report PATH` only after building `elahd` and running `:java:elah-dummy-worker:installDist`. CI uses 25 reconnects; contributors should normally use a smaller number locally.

The listener and worker both reject non-loopback plaintext endpoints. This is not a deployment topology and must not be exposed to a network.
