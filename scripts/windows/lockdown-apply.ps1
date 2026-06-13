#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Azhura CBT — Windows lockdown provisioning (APPLY). Issue #127.

.DESCRIPTION
    Menonaktifkan opsi-opsi pada secure desktop (Ctrl+Alt+Del):
    Task Manager, Lock, Sign out (Logoff), Switch User (Fast User Switching),
    dan (opsional) Change Password — lewat kebijakan registry per-mesin.

    PENTING: Ctrl+Alt+Del (Secure Attention Sequence / SAS) ditangani kernel
    Windows dan TIDAK BISA diblokir aplikasi user-mode mana pun. Skrip ini hanya
    mematikan OPSI yang muncul di secure desktop — SAS itu sendiri tetap muncul.

    Ini langkah provisioning/deployment (BUKAN kode aplikasi), pelengkap
    epic #24 (Exam Lockdown Engine) + L3 OS Keyboard Hook (#27) + deteksi #126.

    Dokumentasi: docs/security/windows-lockdown-provisioning.md

.NOTES
    - Jalankan sebagai Administrator.
    - Idempotent: aman dijalankan berulang.
    - WAJIB jalankan lockdown-revert.ps1 setelah ujian selesai.
    - Mendukung -WhatIf / -Confirm via SupportsShouldProcess.
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    # Sertakan kebijakan "Remove Change Password" (DisableChangePassword).
    [switch]$IncludeChangePassword
)

$ErrorActionPreference = 'Stop'

$PoliciesSubPath = 'Software\Microsoft\Windows\CurrentVersion\Policies\System'
$HkcuPolicies = "HKCU:\$PoliciesSubPath"
$HklmPolicies = "HKLM:\$PoliciesSubPath"

function Set-PolicyDword {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [string]$Name,
        [Parameter(Mandatory)] [int]$Value
    )

    if (-not (Test-Path -Path $Path)) {
        if ($PSCmdlet.ShouldProcess($Path, 'Create registry key')) {
            New-Item -Path $Path -Force | Out-Null
        }
    }

    if ($PSCmdlet.ShouldProcess("$Path\$Name", "Set DWORD = $Value")) {
        Set-ItemProperty -Path $Path -Name $Name -Value $Value -Type DWord -Force
        Write-Host ("  [SET] {0}\{1} = {2}" -f $Path, $Name, $Value)
    }
}

Write-Host ''
Write-Host '=== Azhura CBT — Lockdown APPLY (#127) ===' -ForegroundColor Cyan
Write-Host 'Mematikan opsi secure-desktop (Task Manager / Lock / Sign out / Switch User).'
Write-Host 'Catatan: Ctrl+Alt+Del TETAP muncul — SAS tidak bisa diblokir.' -ForegroundColor Yellow
Write-Host ''

# --- Per-user (HKCU): berlaku untuk pengguna saat ini ---
Write-Host 'Menerapkan kebijakan per-user (HKCU)...'
Set-PolicyDword -Path $HkcuPolicies -Name 'DisableTaskMgr'         -Value 1
Set-PolicyDword -Path $HkcuPolicies -Name 'DisableLockWorkstation' -Value 1
Set-PolicyDword -Path $HkcuPolicies -Name 'NoLogoff'               -Value 1
if ($IncludeChangePassword) {
    Set-PolicyDword -Path $HkcuPolicies -Name 'DisableChangePassword' -Value 1
}

# --- Per-machine (HKLM): Fast User Switching (Switch User) ---
Write-Host 'Menerapkan kebijakan per-machine (HKLM)...'
Set-PolicyDword -Path $HklmPolicies -Name 'HideFastUserSwitching' -Value 1

Write-Host ''
Write-Host 'Ringkasan perubahan:' -ForegroundColor Green
Write-Host '  - DisableTaskMgr         = 1  (Task Manager dimatikan)'
Write-Host '  - DisableLockWorkstation = 1  (Lock dimatikan)'
Write-Host '  - NoLogoff               = 1  (Sign out / Logoff dimatikan)'
if ($IncludeChangePassword) {
    Write-Host '  - DisableChangePassword  = 1  (Change Password dimatikan)'
}
Write-Host '  - HideFastUserSwitching  = 1  (Switch User disembunyikan, HKLM)'
Write-Host ''
Write-Host 'LANGKAH BERIKUTNYA:' -ForegroundColor Cyan
Write-Host '  1) Jalankan:  gpupdate /force'
Write-Host '  2) Verifikasi: Ctrl+Alt+Del muncul, tapi opsi di atas disabled.'
Write-Host '  3) WAJIB setelah ujian: jalankan scripts\windows\lockdown-revert.ps1' -ForegroundColor Yellow
Write-Host ''
