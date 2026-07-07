<#
.SYNOPSIS
  Generate a self-signed Authenticode code-signing certificate for signing the
  Azhura CBT student installer (issue #28, Tahap 1).

.DESCRIPTION
  Creates a ~3-year self-signed code-signing cert in Cert:\CurrentUser\My and
  exports two files:
    - <OutDir>\azhura-codesign.pfx  (PRIVATE key, password-protected)
                                     -> base64 it into the WINDOWS_CERT_PFX_BASE64
                                        GitHub secret so CI can sign builds.
    - <OutDir>\azhura-codesign.cer  (PUBLIC cert) -> distribute to school
                                        machines via deploy-codesign-cert.ps1 / GPO.

  This is a SELF-SIGNED cert for INTERNAL/managed machines only. For public trust
  (no SmartScreen warning on unmanaged PCs) use Azure Trusted Signing — see
  docs/CODE_SIGNING.md (Tahap 2). Post-June-2023, public CA OV/EV certs require
  hardware key storage (HSM/USB token), so a plain .pfx is self-signed-only.

  !!! SECURITY: NEVER commit the generated .pfx / .cer, the password, or the
  !!! thumbprint to git. They are secrets / distribution artifacts, not source.

.PARAMETER PfxPassword
  Password protecting the exported .pfx. REQUIRED — prompted securely if omitted.
  Do NOT hardcode it; pass it interactively or from a secret manager.

.PARAMETER OutDir
  Directory to write the .pfx / .cer into. Defaults to the current directory.

.PARAMETER Subject
  Certificate subject. Defaults to "CN=Azhura CBT".

.EXAMPLE
  pwsh ./scripts/gen-codesign-cert.ps1 -OutDir C:\azhura-certs
  (prompts for the PFX password)
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [SecureString]$PfxPassword,

    [string]$OutDir = (Get-Location).Path,

    [string]$Subject = "CN=Azhura CBT"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

$pfxPath = Join-Path $OutDir "azhura-codesign.pfx"
$cerPath = Join-Path $OutDir "azhura-codesign.cer"

Write-Host "Generating self-signed code-signing certificate ($Subject)..."
# Validity capped at 3 years to keep a sane rotation cadence — a shorter-lived
# signing key limits the blast radius of a leak. Recommended: rotate the cert
# (re-run this script, update the GitHub secrets, re-deploy the new .cer) every
# ~3 years, before expiry. Installers signed with a TIMESTAMPED signature stay
# valid past the cert's expiry, so rotation does not invalidate old builds.
$cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject $Subject `
    -KeyAlgorithm RSA `
    -KeyLength 4096 `
    -HashAlgorithm SHA256 `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -NotAfter (Get-Date).AddYears(3)

Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $PfxPassword | Out-Null
Export-Certificate   -Cert $cert -FilePath $cerPath -Type CERT          | Out-Null

Write-Host ""
Write-Host "Certificate created."
Write-Host "  Thumbprint : $($cert.Thumbprint)"
Write-Host "  PFX (private, password-protected): $pfxPath"
Write-Host "  CER (public, for distribution)   : $cerPath"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Base64-encode the PFX for the WINDOWS_CERT_PFX_BASE64 GitHub secret:"
Write-Host "       certutil -encode `"$pfxPath`" azhura-codesign.pfx.b64"
Write-Host "     or in PowerShell:"
Write-Host "       [Convert]::ToBase64String([IO.File]::ReadAllBytes('$pfxPath')) | Set-Content azhura-codesign.pfx.b64"
Write-Host "  2. Store that base64 string as WINDOWS_CERT_PFX_BASE64 and the PFX"
Write-Host "     password as WINDOWS_CERT_PASSWORD in the repo's GitHub Actions secrets."
Write-Host "  3. Deploy the .cer to each school machine with deploy-codesign-cert.ps1."
Write-Host ""
Write-Host "REMINDER: never commit the .pfx, .cer, base64, password, or thumbprint."
