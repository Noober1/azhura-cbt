#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install the Azhura CBT public code-signing certificate (.cer) on a school
  machine so the signed installer (and the #27 L3 keyboard hook) is trusted by
  Windows / SmartScreen / AV (issue #28, Tahap 1).

.DESCRIPTION
  Imports the PUBLIC .cer (exported by gen-codesign-cert.ps1) into BOTH:
    - Cert:\LocalMachine\Root            (Trusted Root CA  -> chain is trusted)
    - Cert:\LocalMachine\TrustedPublisher (Trusted Publishers -> no "unknown
                                            publisher" prompt; AV/SmartScreen
                                            trusts the signed binary)

  Only the PUBLIC .cer is deployed — never the .pfx / private key.

  Requires elevation (run from an elevated PowerShell). For domain-wide rollout,
  prefer Group Policy instead of running this per-machine:
    Computer Configuration > Policies > Windows Settings > Security Settings >
    Public Key Policies > Trusted Root Certification Authorities (and
    Trusted Publishers) — import the same .cer there and it deploys to all
    domain-joined machines automatically.

.PARAMETER CerPath
  Path to the public .cer to install. REQUIRED.

.EXAMPLE
  pwsh ./scripts/deploy-codesign-cert.ps1 -CerPath .\azhura-codesign.cer
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$CerPath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $CerPath)) {
    throw "Certificate file not found: $CerPath"
}

# Installing into Trusted Root / TrustedPublisher is a HIGH-TRUST operation:
# anything signed by this cert becomes trusted on the machine. Never blindly
# trust an arbitrary file — verify it is the Azhura CBT cert before installing.
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $CerPath
if ($cert.Subject -notmatch 'CN=Azhura CBT') {
    throw "Refusing to install: unexpected certificate subject '$($cert.Subject)' (expected CN=Azhura CBT)."
}
Write-Host "Validated certificate subject: $($cert.Subject)"

Write-Host "Installing '$CerPath' into LocalMachine\Root (Trusted Root CA)..."
Import-Certificate -FilePath $CerPath -CertStoreLocation "Cert:\LocalMachine\Root" | Out-Null

Write-Host "Installing '$CerPath' into LocalMachine\TrustedPublisher (Trusted Publishers)..."
Import-Certificate -FilePath $CerPath -CertStoreLocation "Cert:\LocalMachine\TrustedPublisher" | Out-Null

# Equivalent low-level alternative if Import-Certificate is unavailable:
#   certutil -addstore -f Root            "$CerPath"
#   certutil -addstore -f TrustedPublisher "$CerPath"

Write-Host ""
Write-Host "Done. The signed Azhura CBT installer will now be trusted on this machine."
Write-Host "For all domain machines at once, deploy the same .cer via Group Policy instead."
