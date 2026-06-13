# Windows OS Provisioning — Menonaktifkan Opsi Secure Attention Sequence (SAS)

> **Issue #127** · Pelengkap **epic #24 (Exam Lockdown Engine)** dan **L3 OS Keyboard Hook (#27)**.
> Ini adalah **langkah provisioning/deployment per-mesin**, **bukan** kode aplikasi. Disengaja agar aplikasi
> ujian tidak perlu menanam service privileged (SYSTEM) — mengurangi risiko deteksi AV/EDR.

---

## 1. Tujuan & Batasan

**Ctrl+Alt+Del (Secure Attention Sequence / SAS) ditangani oleh kernel Windows dan TIDAK BISA ditelan
oleh aplikasi user-mode mana pun** — bukan oleh aplikasi ini, bukan pula oleh SafeExamBrowser. Menekan
Ctrl+Alt+Del **tetap** akan memunculkan *secure desktop* (layar biru SAS). Yang **bisa** kita lakukan untuk
lab sekolah yang dikelola (*managed lab*) adalah **mematikan opsi-opsi yang muncul di secure desktop** lewat
kebijakan OS, per-mesin.

Setelah provisioning ini diterapkan:

- Ctrl+Alt+Del **tetap muncul** (tidak bisa dicegah — *by design* kernel).
- Tetapi opsi berikut **dinonaktifkan** pada secure desktop: **Task Manager**, **Lock** (kunci komputer),
  **Switch User** (Fast User Switching), dan **Sign out** (Logoff). **Change Password** opsional.

> **Catatan integrasi:** Provisioning ini **melengkapi deteksi**, bukan menggantikannya. Pelanggaran yang
> tetap lolos (mis. siswa membuka secure desktop) diawasi dan dialarmkan ke supervisor lewat
> **#126**. Pertahanan berlapis: cegah di OS (dokumen ini) + deteksi & alarm (#126) + hook keyboard L3 (#27).

---

## 2. Dua Jalur Penerapan

### Jalur A — Group Policy (mesin domain / `gpedit.msc`)

Untuk lab yang tergabung domain (atau Windows Pro/Enterprise/Education standalone dengan `gpedit.msc`),
gunakan Group Policy. Setiap setelan di bawah memetakan langsung ke registry value yang sama dengan Jalur B.

**User Configuration → Administrative Templates → System → Ctrl+Alt+Del Options:**

| Setelan GPO | Aksi | Registry value yang dipetakan |
|---|---|---|
| **Remove Task Manager** | *Enabled* | `DisableTaskMgr` = 1 |
| **Remove Lock Computer** | *Enabled* | `DisableLockWorkstation` = 1 |
| **Remove Logoff** | *Enabled* | `NoLogoff` = 1 |
| **Remove Change Password** *(opsional)* | *Enabled* | `DisableChangePassword` = 1 |

**Computer Configuration → Administrative Templates → System → Logon:**

| Setelan GPO | Aksi | Registry value yang dipetakan |
|---|---|---|
| **Hide entry points for Fast User Switching** | *Enabled* | `HideFastUserSwitching` = 1 (HKLM) |

Setelah mengubah GPO, jalankan:

```powershell
gpupdate /force
```

### Jalur B — Standalone (skrip registry)

Untuk mesin yang **tidak** tergabung domain, atau **Windows Home** (yang tidak punya `gpedit.msc`), gunakan
skrip registry yang disediakan repo ini. Skrip menulis registry value yang persis sama dengan yang dipetakan
GPO di atas, sehingga berlaku di **semua edisi Windows**.

**Terapkan (jalankan sebagai Administrator):**

```powershell
# dari folder repo
powershell -ExecutionPolicy Bypass -File scripts\windows\lockdown-apply.ps1
gpupdate /force
```

**Pulihkan (WAJIB setelah ujian — lihat bagian REVERT):**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\lockdown-revert.ps1
gpupdate /force
```

---

## 3. Registry Keys (dokumentasi persis)

Semua value bertipe **DWORD**. **Buat key jika belum ada** (skrip melakukannya otomatis dengan `New-Item -Force`).

Value pada level **per-user** berada di:

```
HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System
```

Untuk berlaku **semua pengguna** pada satu mesin, value yang sama dapat ditulis di HKLM:

```
HKLM\Software\Microsoft\Windows\CurrentVersion\Policies\System
```

`HideFastUserSwitching` **hanya** berlaku di HKLM (kebijakan per-mesin).

| Value | Hive | Tipe | `1` (aktif / opsi dimatikan) | `0` atau dihapus (default) |
|---|---|---|---|---|
| `DisableTaskMgr` | HKCU (atau HKLM) | DWORD | Task Manager **dinonaktifkan** di secure desktop & sistem | Task Manager normal |
| `DisableLockWorkstation` | HKCU (atau HKLM) | DWORD | Opsi **Lock** (kunci komputer) dimatikan | Lock normal |
| `NoLogoff` | HKCU (atau HKLM) | DWORD | Opsi **Sign out / Logoff** dimatikan | Sign out normal |
| `DisableChangePassword` *(opsional)* | HKCU (atau HKLM) | DWORD | Opsi **Change Password** dimatikan | Change Password normal |
| `HideFastUserSwitching` | **HKLM** | DWORD | **Switch User** (Fast User Switching) disembunyikan | Switch User normal |

> **Konvensi:** `1` = kebijakan aktif (opsi **dimatikan**). Menghapus value atau menyetelnya `0` mengembalikan
> perilaku default Windows. Skrip `lockdown-apply.ps1` menulis `1`; `lockdown-revert.ps1` **menghapus** value
> tersebut sehingga default kembali.

---

## 4. (Opsi Kuat) Assigned Access / Shell Launcher (Kiosk)

Penguncian **terkuat** adalah mode kiosk OS — **Assigned Access** (single-app kiosk) atau **Shell Launcher**
(mengganti `explorer.exe` dengan shell kustom). Mode ini mengunci mesin ke satu aplikasi dan memangkas
hampir semua jalur keluar, termasuk sebagian besar opsi pada secure desktop.

> ⚠️ **Caveat edisi:** Assigned Access & Shell Launcher **hanya** tersedia di **Windows Enterprise /
> Education / IoT** (Shell Launcher butuh Enterprise/IoT). **Tidak** tersedia di Home/Pro standar.

Dokumen ini **tidak** menyertakan konfigurasi kiosk lengkap (di luar cakupan #127). Untuk lab yang memenuhi
syarat edisi, rujuk dokumentasi resmi Microsoft:

- Assigned Access (kiosk): <https://learn.microsoft.com/windows/configuration/assigned-access/>
- Shell Launcher: <https://learn.microsoft.com/windows/configuration/shell-launcher/>

---

## 5. REVERT (WAJIB)

**Selalu jalankan `lockdown-revert.ps1` setelah ujian selesai.** Jika tidak, mesin lab akan tetap terkunci
(Task Manager / Lock / Switch User / Sign out tetap mati) untuk pemakaian sehari-hari.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\lockdown-revert.ps1
gpupdate /force
```

Skrip revert **menghapus** value berikut sehingga default Windows kembali:
`DisableTaskMgr`, `DisableLockWorkstation`, `NoLogoff`, `DisableChangePassword` (HKCU **dan** HKLM bila ada),
serta `HideFastUserSwitching` (HKLM). Skrip bersifat **idempotent** — aman dijalankan walau value sudah hilang.

> Jika Anda menerapkan via **GPO** (Jalur A), revert dilakukan dengan menyetel setelan GPO terkait kembali ke
> *Not Configured* lalu `gpupdate /force` — **bukan** dengan skrip revert (skrip hanya menyentuh value yang
> ditulis Jalur B).

---

## 6. Keterbatasan Edisi (ringkasan)

| Kemampuan | Home | Pro | Enterprise / Education / IoT |
|---|---|---|---|
| Skrip registry (Jalur B) | ✅ | ✅ | ✅ |
| `gpedit.msc` / GPO lokal (Jalur A) | ❌ | ✅ | ✅ |
| Assigned Access (kiosk) | ❌ | ❌ | ✅ |
| Shell Launcher | ❌ | ❌ | ✅ (Enterprise/IoT) |

> **Fallback Windows Home:** karena Home tidak punya `gpedit.msc`, gunakan **skrip registry (Jalur B)** —
> bekerja di semua edisi.

---

## 7. Verifikasi

**Setelah `lockdown-apply.ps1` + `gpupdate /force`:**

1. Tekan **Ctrl+Alt+Del** → secure desktop **tetap muncul** (ini *expected*, SAS tak bisa dicegah).
2. Pada secure desktop, **Task Manager**, **Lock**, **Switch User**, dan **Sign out** harus **disabled /
   hilang**.
3. Bila perlu, log out lalu log in ulang (atau `gpupdate /force`) agar kebijakan per-user terbaca.

**Setelah `lockdown-revert.ps1` + `gpupdate /force`:**

1. Tekan **Ctrl+Alt+Del** → semua opsi (Task Manager, Lock, Switch User, Sign out) **kembali normal**.

---

## 8. Catatan Keamanan / Operasional

- **Jalankan sebagai Administrator.** Skrip menulis ke HKLM dan memakai `#Requires -RunAsAdministrator`.
- **Uji di satu mesin dulu** sebelum *roll-out* ke seluruh lab.
- **Selalu revert** setelah ujian agar mesin tidak tertinggal dalam kondisi terkunci.
- Provisioning ini **tidak menambah service privileged** ke aplikasi ujian — sengaja, untuk menekan risiko
  AV/EDR. Penegakan keamanan ada di lapisan OS/deployment, bukan di binary aplikasi.
