#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Azhura CBT — Windows lockdown provisioning (REVERT). Issue #127.

.DESCRIPTION
    Membatalkan lockdown-apply.ps1 dengan MENGHAPUS value kebijakan registry
    sehingga perilaku default Windows kembali: Task Manager, Lock, Sign out
    (Logoff), Switch User (Fast User Switching), dan Change Password aktif lagi.

    WAJIB dijalankan setelah ujian selesai agar mesin lab tidak tertinggal
    dalam kondisi terkunci.

    Dokumentasi: docs/security/windows-lockdown-provisioning.md

.NOTES
    - Jalankan sebagai Administrator.
    - Idempotent: aman walau value sudah tidak ada (-ErrorAction SilentlyContinue).
    - Menyentuh HKCU dan HKLM. Untuk penerapan via GPO, set setelan terkait ke
      "Not Configured" lalu gpupdate /force (skrip ini hanya membersihkan value
      yang ditulis jalur standalone / lockdown-apply.ps1).
    - Mendukung -WhatIf / -Confirm via SupportsShouldProcess.
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param()

$ErrorActionPreference = 'Stop'

$PoliciesSubPath = 'Software\Microsoft\Windows\CurrentVersion\Policies\System'
$HkcuPolicies = "HKCU:\$PoliciesSubPath"
$HklmPolicies = "HKLM:\$PoliciesSubPath"

function Remove-PolicyValue {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [string]$Name
    )

    if (-not (Test-Path -Path $Path)) {
        Write-Host ("  [SKIP] {0}\{1} (key tidak ada)" -f $Path, $Name)
        return
    }

    $exists = $null -ne (Get-ItemProperty -Path $Path -Name $Name -ErrorAction SilentlyContinue)
    if (-not $exists) {
        Write-Host ("  [SKIP] {0}\{1} (value tidak ada)" -f $Path, $Name)
        return
    }

    if ($PSCmdlet.ShouldProcess("$Path\$Name", 'Remove registry value')) {
        Remove-ItemProperty -Path $Path -Name $Name -ErrorAction SilentlyContinue
        Write-Host ("  [DEL] {0}\{1}" -f $Path, $Name)
    }
}

Write-Host ''
Write-Host '=== Azhura CBT — Lockdown REVERT (#127) ===' -ForegroundColor Cyan
Write-Host 'Mengembalikan opsi secure-desktop ke default Windows.'
Write-Host ''

# --- Per-user (HKCU) ---
Write-Host 'Memulihkan kebijakan per-user (HKCU)...'
Remove-PolicyValue -Path $HkcuPolicies -Name 'DisableTaskMgr'
Remove-PolicyValue -Path $HkcuPolicies -Name 'DisableLockWorkstation'
Remove-PolicyValue -Path $HkcuPolicies -Name 'NoLogoff'
Remove-PolicyValue -Path $HkcuPolicies -Name 'DisableChangePassword'

# --- Per-machine (HKLM): bersihkan juga value yang mungkin ditulis all-users ---
Write-Host 'Memulihkan kebijakan per-machine (HKLM)...'
Remove-PolicyValue -Path $HklmPolicies -Name 'HideFastUserSwitching'
Remove-PolicyValue -Path $HklmPolicies -Name 'DisableTaskMgr'
Remove-PolicyValue -Path $HklmPolicies -Name 'DisableLockWorkstation'
Remove-PolicyValue -Path $HklmPolicies -Name 'NoLogoff'
Remove-PolicyValue -Path $HklmPolicies -Name 'DisableChangePassword'

Write-Host ''
Write-Host 'Ringkasan: value kebijakan dihapus (default Windows kembali).' -ForegroundColor Green
Write-Host ''
Write-Host 'LANGKAH BERIKUTNYA:' -ForegroundColor Cyan
Write-Host '  1) Jalankan:  gpupdate /force'
Write-Host '  2) Verifikasi: Ctrl+Alt+Del -> Task Manager / Lock / Switch User / Sign out normal kembali.'
Write-Host ''
