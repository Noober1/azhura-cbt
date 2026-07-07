# Releasing the Student App (Tauri / Windows)

The student exam client (`apps/student`) is distributed as a native installer
built by the **Student Release** GitHub Actions workflow
(`.github/workflows/student-release.yml`, issue #175). This doc is the
cut-a-release checklist.

## Windows-first policy

Exam workstations run Windows, so **`windows-latest` is the required build
target** — it produces the WiX `.msi` and NSIS `.exe`. The Linux build
(`ubuntu-latest`, AppImage + `.deb`) is best-effort/internal for QA only and
is allowed to fail without blocking the Windows release (`fail-fast: false`).

## Tag convention

Releases are driven by an annotated git tag:

```
student-vX.Y.Z      e.g. student-v0.1.0
```

The `X.Y.Z` in the tag **must match** the `version` field in **both**:

- `apps/student/src-tauri/tauri.conf.json`
- `apps/student/src-tauri/Cargo.toml`

Tauri stamps installer file names from `tauri.conf.json`'s `version`, so a tag
that disagrees with the config produces a Release whose assets don't match the
tag name. The `student-v*` prefix keeps this pipeline isolated from any future
backend/console release tags.

> Tauri's config does not support comments in strict JSON mode, so the version
> contract is documented here and in the workflow header rather than inline in
> `tauri.conf.json`.

## How to cut a release

1. **Bump the version in both files to the same `X.Y.Z`:**
   - `apps/student/src-tauri/tauri.conf.json` → `"version": "X.Y.Z"`
   - `apps/student/src-tauri/Cargo.toml` → `version = "X.Y.Z"`
2. Commit the bump (e.g. `chore: release student vX.Y.Z`) and merge to `main`.
3. **Tag and push** (use an **annotated** tag — the workflow expects one):
   ```bash
   git tag -a student-vX.Y.Z -m "Release student-vX.Y.Z"
   git push origin student-vX.Y.Z
   ```
4. The workflow builds on Windows (+ Linux) and creates a **draft** GitHub
   Release named `Azhura Student student-vX.Y.Z` with the installers attached.
5. **Verify the draft** (download + smoke-test the `.msi`/`.exe`), then publish
   it from the GitHub Releases UI.

You can also run the workflow manually via **Actions → Student Release → Run
workflow** (`workflow_dispatch`) for a dry-run build without tagging. A manual
dispatch runs the build/setup steps as a smoke-test but does **not** create a
Release (only `student-v*` tag pushes do).

> **Tag protection:** pushing a `student-v*` tag cuts a release, so only trusted
> maintainers should be allowed to push them — enforce this via the repo's tag
> protection rules (Settings → Tags / rulesets).
>
> **Rust channel:** the workflow pins `dtolnay/rust-toolchain@stable`, which
> intentionally floats with the Rust **stable** channel rather than a fixed
> Rust version.

## What plugs in later

- **Code signing — issue #28.** The Windows `.msi`/`.exe` are currently
  **unsigned**. A commented placeholder in the workflow shows where to import a
  base64-encoded PFX (`secrets.WINDOWS_CERT_PFX_BASE64` /
  `secrets.WINDOWS_CERT_PASSWORD`) and pass the cert to `tauri-action` at bundle
  time. Marked `Diaktifkan oleh #28 (code signing)`. Until then the pipeline
  runs without any signing secrets.
- **Self-update — issue #49.** The LAN update-proxy consumes the installer
  assets this workflow attaches. When the updater plugin lands, a commented
  `env` placeholder (`secrets.TAURI_SIGNING_PRIVATE_KEY` /
  `secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) enables update-signing and the
  `latest.json` manifest. Marked `Diaktifkan oleh #49 (self-update)`.

Both placeholders are inactive and the workflow runs green without their
secrets present.
