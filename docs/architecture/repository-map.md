# Repository map

Genesis begins with public contracts and the roots below. Later work expands them in place so cross-language protocol changes can be reviewed together.

```text
crates/       Rust control-plane, core, storage, scheduler, and test crates
java/         Elah API, workers, Folia integration, and Sling
lab/          Bot, scenario, replay, fixture, chaos, and visualisation work
proto/        Control, worker, handoff, storage, and observability schemas
schemas/      Configuration, manifest, snapshot, and topology schemas
scripts/      Bootstrap, study, benchmark, and release tooling
docs/         Architecture, ADRs, operations, research, protocol, and releases
tests/        Integration, compatibility, failure, storage, handoff, and soak tests
studying/     Ignored upstream checkouts; never a production dependency
```

`lab/folia/` contains the development-only 0.0.5 Folia Baseline Laboratory. It composes the shared server fixture, qualified client sessions, read-only Observer, stopped-world hashing, and independent report verification. It is not a production Folia integration module.

`studying/` is intentionally isolated. Only its tracked instructions and manifest may be committed; upstream clones, generated study artifacts, and experimentation outputs stay ignored. A build, package, release archive, container, or SBOM that resolves an item from `studying/` is a defect.
