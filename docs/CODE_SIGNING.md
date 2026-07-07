# Code Signing the Student Installer (Windows) — issue #28

The student exam client (`apps/student`) ships as a Windows `.msi`/`.exe`. To
keep SmartScreen/AV from flagging the installer (and the #27 low-level keyboard
hook from being quarantined), the bundles are **Authenticode-signed** in CI.

**Tahap 1 (current): self-signed certificate + deploy the public `.cer` to the
managed school machines.** Installers only run on managed Windows exam
workstations, so a self-signed cert installed into each machine's Trusted Root +
Trusted Publishers stores is sufficient and avoids a public CA. **Tahap 2
(optional, future): Azure Trusted Signing** for public trust on unmanaged PCs.

> Signing is **guarded** in CI: the build signs only when the signing secret is
> present. With no secret set, builds ship **unsigned** and the pipeline still
> passes — so dev/QA builds are never blocked.

---

## a. Generate the certificate

Run on a Windows machine with PowerShell:

```powershell
pwsh ./scripts/gen-codesign-cert.ps1 -OutDir C:\azhura-certs
# Prompts for the PFX password.
```

This produces a ~3-year self-signed code-signing cert and exports:

- `azhura-codesign.pfx` — **private** key, password-protected (for the CI secret).
- `azhura-codesign.cer` — **public** cert (for distribution to school machines).

The script prints the certificate **thumbprint**.

> **NEVER commit** the `.pfx`, `.cer`, the base64 blob, the password, or the
> thumbprint. They are secrets / distribution artifacts, not source.

## b. Store the secrets in GitHub

1. Base64-encode the PFX:
   ```powershell
   certutil -encode .\azhura-codesign.pfx azhura-codesign.pfx.b64
   # or:
   [Convert]::ToBase64String([IO.File]::ReadAllBytes('azhura-codesign.pfx')) | Set-Content azhura-codesign.pfx.b64
   ```
2. In the repo: **Settings → Secrets and variables → Actions → New repository
   secret** and add:
   - `WINDOWS_CERT_PFX_BASE64` — the base64 string from step 1.
   - `WINDOWS_CERT_PASSWORD` — the PFX password.
3. **Securely delete the local `*.pfx.b64` intermediate** once it is stored in
   the GitHub secret. It is a plaintext-accessible copy of the private key and
   must not linger on disk:
   ```powershell
   Remove-Item .\azhura-codesign.pfx.b64
   ```
   Store the `.pfx` itself only in a secrets manager / encrypted vault, and
   securely destroy any working copy you no longer need (the `.gitignore`
   already blocks `*.pfx`, `*.cer`, and `*.b64` from being committed, but that
   does not protect against an on-disk copy being read by another user).

## c. CI auto-signs tagged builds

On a `student-v*` tag push, `.github/workflows/student-release.yml`:

1. **Import code-signing certificate** — decodes `WINDOWS_CERT_PFX_BASE64` to a
   temp `.pfx`, imports it into `Cert:\CurrentUser\My`, and resolves the
   thumbprint (the password is `::add-mask::`-ed; nothing secret is printed).
2. **Enable signing in tauri.conf.json** — injects the resolved thumbprint into
   `bundle.windows.certificateThumbprint`.
3. **Build & draft release** — Tauri's bundler invokes `signtool`, which finds
   the private key by thumbprint and signs the `.msi`/`.exe`, timestamping via
   `bundle.windows.timestampUrl` (`https://timestamp.digicert.com`). The
   timestamp keeps the signature valid even after the cert expires.
4. **Clean up code-signing certificate** (`if: always()`) — deletes the temp
   `.pfx` and removes the imported cert so the private key never lingers.

If `WINDOWS_CERT_PFX_BASE64` is **absent**, every signing step is skipped via the
`env.WINDOWS_CERT_PFX_BASE64 != ''` guard, `certificateThumbprint` stays `null`,
and the build ships unsigned but green.

## d. Deploy the public cert to school machines

On each Windows exam workstation, from an **elevated** PowerShell:

```powershell
pwsh ./scripts/deploy-codesign-cert.ps1 -CerPath .\azhura-codesign.cer
```

This installs the `.cer` into both `LocalMachine\Root` (Trusted Root CA) and
`LocalMachine\TrustedPublisher` (Trusted Publishers).

**Domain-wide alternative (recommended for many machines):** deploy the same
`.cer` via **Group Policy** — *Computer Configuration → Policies → Windows
Settings → Security Settings → Public Key Policies → Trusted Root Certification
Authorities* (and *Trusted Publishers*). It propagates to all domain-joined
machines automatically.

## e. Why self-signed only (post-June-2023 rule)

Since June 2023, **public CA OV/EV code-signing certificates must have their
private keys stored on hardware** (HSM or a FIPS-validated USB token). A plain
exportable `.pfx` can therefore **only** be used for **self-signed / internal**
signing. That is exactly our Tahap 1 model: self-signed cert + push the public
`.cer` to managed machines. For trust on **unmanaged** machines (no manual cert
deploy), use **Azure Trusted Signing** (Tahap 2): Microsoft holds the key in its
HSM and you sign via a CI integration — no local `.pfx` and no SmartScreen
warning. Tahap 2 is documentation-only for now.

## f. Key rotation / leak response

If the private key leaks or you need to rotate:

1. Re-run `gen-codesign-cert.ps1` to generate a fresh cert (new thumbprint).
2. Update `WINDOWS_CERT_PFX_BASE64` + `WINDOWS_CERT_PASSWORD` in GitHub secrets.
3. Re-deploy the new `.cer` to every school machine (script or GPO).
4. Optionally remove the old cert from machines' Trusted Publishers store.

Previously-signed installers stay valid as long as their signature was
timestamped, but stop trusting a leaked key by removing it everywhere.
