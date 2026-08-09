# Studying upstream repositories

This directory isolates reproducible, read-only upstream research from Elah's production source tree. The checked-in [manifest](manifest.lock) is the only authority for checkout URL, ref, commit, observed SPDX identifier, licensing caveat, study purpose, and linked ADRs.

The manifest was retrieved on 2026-08-09. Its `NOASSERTION` entries record GitHub/API ambiguity explicitly; they are not permission to assume a license. In particular, C2ME-fabric is not uniformly MIT because its OpenCL module is proprietary and All Rights Reserved.

## Detached checkout workflow

Use a separate, detached checkout for each pinned repository. Do not clone or copy upstream source outside the ignored child directories of `studying/`, and do not add a study checkout to a build, package, release archive, container, SBOM, or dependency graph.

```sh
git clone https://github.com/PaperMC/Folia studying/papermc/Folia
git -C studying/papermc/Folia checkout --detach 57f643f10e0a9d01024773232d38ae666067d593
git -C studying/papermc/Folia status --short --branch
```

Replace the URL, directory, and SHA from the manifest for each study target. Verify the detached commit before reading or experimenting. Do not use `git pull` in a study checkout: it advances history and breaks the reproducible pin. To update an upstream, create a reviewed manifest change with newly verified metadata and start a fresh detached checkout at the new commit.
