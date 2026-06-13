# Azhura CBT (Monorepo)

**Azhura CBT** (Computer-Based Test) adalah sistem ujian berbasis komputer yang aman dan tahan-offline untuk sekolah di Indonesia. Repo ini adalah **monorepo Bun workspaces** berisi dua frontend dan satu backend:

| Workspace | Paket | Stack | Peran |
| :--- | :--- | :--- | :--- |
| `apps/student` | `azhura-student` | Tauri 2.x + React 19 + Zustand + Tailwind v4 + shadcn/ui | Klien ujian siswa (desktop native, terkunci, offline-first) |
| `apps/console` | `azhura-console` | Vite + React 19 + Tailwind v4 | Web admin + supervisor (role-gated) — _scaffold_ |
| `packages/shared` | `@azhura/shared` | TypeScript | Sumber kebenaran tipe domain (anti-drift) |
| `backend` | `azhura-exam-backend` | Elysia + Bun + Drizzle + MySQL + Socket.io + JWT | API HTTP & realtime |

> **Kenapa dipisah:** kode admin tidak boleh ikut ter-bundle ke klien ujian siswa (memperluas attack surface), dan Tauri bukan kendaraan tepat untuk panel admin (butuh akses browser & deploy instan). `packages/shared` menjaga kedua frontend tetap sinkron dengan kontrak yang sama.

---

## 🚀 Fitur Utama (Klien Siswa)

1. **Autentikasi Aman**: Login berbasis NIS + password. Token siap diintegrasikan dengan **Tauri Stronghold** untuk enkripsi di memori.
2. **Offline-First Answer Cache (SQLite & LocalStorage)**: Setiap jawaban tersimpan seketika ke DB lokal — SQLite via `@tauri-apps/plugin-sql` di native frame, atau fallback `localStorage` di browser.
3. **Sinkronisasi Otomatis (Connectivity Queue)**: Saat koneksi putus jawaban tetap aman; ketika pulih, background sync queue mengunggah jawaban tertunda.
4. **Pengawasan Real-time (WebSocket)**: Broadcast alert pengawas, force logout (kick), dan force submission dari panel supervisor.
5. **Anti-Cheat Engine** (epic #24, berlapis):
   - **L1 — Fullscreen Lock** — memaksa layar penuh.
   - **L1 — Focus Monitoring** — mendeteksi Alt+Tab / pindah jendela.
   - **L1 — Keyboard Shortcut Blocker** — memblokir F12, refresh, copy-paste, klik kanan, dll.
   - **L2 — Kiosk Window (Tauri)** — fullscreen paksa, always-on-top, force-refocus, blokir close.
   - **L3 — OS Keyboard Hook (Windows)** — `WH_KEYBOARD_LL` menelan Alt+Tab, Alt+Esc, Win, Ctrl+Esc, dan PrintScreen di level OS selama aplikasi berjalan — aktif app-wide seperti L2, lepas hanya saat toggle dimatikan atau aplikasi ditutup (`VITE_ANTI_CHEAT_BLOCK_OS_KEYBOARD`).
   - ⚠️ **Batasan by-design**: Ctrl+Alt+Del / Task Manager adalah _Secure Attention Sequence_ yang ditangani kernel Windows — **tidak bisa** diblokir aplikasi user-mode mana pun. Mitigasi: kebijakan lab (Assigned Access / Group Policy) + pengawasan — lihat [`docs/security/windows-lockdown-provisioning.md`](docs/security/windows-lockdown-provisioning.md) (#127). _Code signing installer_ (#28) menyusul.
6. **Cakupan per Kelas (Group Scoping)**: Siswa hanya melihat & dapat memulai ujian yang diperuntukkan bagi kelasnya (`exam_groups`); grup dibawa pada JWT.

---

## 📂 Struktur Monorepo

```
azhura-exam/                       # root workspace (bun workspaces)
├── apps/
│   ├── student/                   # azhura-student — klien ujian Tauri + React
│   │   ├── src/                   # aplikasi React (lihat di bawah)
│   │   ├── src-tauri/             # shell Rust/Tauri
│   │   └── .env, .env.example, .env.local
│   └── console/                   # azhura-console — web admin + supervisor (scaffold)
├── packages/
│   └── shared/                    # @azhura/shared — tipe domain bersama (TS, tanpa build)
├── backend/                       # azhura-exam-backend — API Elysia + Drizzle + Socket.io
├── package.json                   # workspaces + skrip orkestrasi
└── bun.lock
```

Struktur aplikasi siswa (`apps/student/src`):

```
src/
├── components/
│   ├── auth/        # LoginForm
│   ├── dashboard/   # DashboardPage, DashboardNavbar, ExamListTable, ParticipantCard, StartExamDialog
│   ├── exam/        # ExamLayout, QuestionRenderer, TimerDisplay, ExamSidebar, NavigationPanel, SubmitConfirmation, ResultPage
│   ├── layout/      # AuthLayout
│   └── ui/          # primitives shadcn/ui
├── hooks/           # useExamTimer, useSocketEvent
├── lib/             # api.ts, socket.ts, storage.ts, anti-cheat-config.ts, errors.ts, logger.ts, utils.ts
├── routes/          # HashRouter + protected routes
├── stores/          # Zustand: auth, exam, connectivity, socket, anti-cheat
├── types/           # re-export @azhura/shared
├── App.tsx
└── main.tsx
```

---

## 🏃 Menjalankan (dari root)

Semua skrip dijalankan dari **root** dan diteruskan ke workspace via `bun --filter`.

```bash
bun install                  # install semua workspace + link @azhura/shared ke tiap app

# Klien siswa (apps/student)
bun run dev                  # Vite dev server (web, port 1420)
bun run build                # tsc + vite build → apps/student/dist
bun run tauri:dev            # Tauri desktop, hot reload
bun run tauri:build          # installer native (.exe / .msi / .dmg / .AppImage)

# Console admin/supervisor (apps/console)
bun run console:dev          # Vite dev server (web, port 1430)
bun run console:build        # tsc + vite build → apps/console/dist

# Backend API (backend)
bun run backend:dev          # Elysia hot-reload
bun run backend:start        # Elysia (tanpa watch)
```

Tugas DB (dari folder `backend/`): `bun run seed`, `bun run migrate`, `bun run db:generate`, `bun run db:studio`.

> Bentuk filter yang dipakai adalah `bun --filter <pkg> <script>`. Anda juga bisa `cd` ke folder workspace dan menjalankan skripnya langsung.

---

## 🛠️ Panduan Pengembangan

### 1. Siapkan Backend & Seed

```bash
bun run backend:dev               # jalankan API (default http://localhost:3000)
cd backend && bun run migrate     # terapkan skema
cd backend && bun run seed        # data lengkap: admin + supervisor + siswa + exam
# atau, untuk mensimulasikan instalasi baru (lihat "Setup Awal" di bawah):
cd backend && bun run seed:demo   # 4 siswa / 2 group + 1 exam, TANPA admin → memicu Setup Wizard
```

Kredensial hasil `seed`:

| NIS | Password | Nama | Peran / Kelas |
| :--- | :--- | :--- | :--- |
| `88888` | `admin@123` | Administrator | Admin (console) |
| `00001` | `supervisor@123` | Pengawas Utama | Supervisor (console) |
| `12345` | `student@123` | Ahmad Faisal | Siswa · 7A |
| `67890` | `student@123` | Budi Santoso | Siswa · 7B |
| `99999` | `student@123` | Citra Lestari | Siswa · 8A |

### 2. Jalankan Klien Siswa

```bash
cp apps/student/.env.example apps/student/.env.local   # sesuaikan bila perlu
bun run dev          # atau: bun run tauri:dev untuk frame desktop
```

### 3. Event Real-time Pengawas

Event pengawas (`alert-message`, `force-submit`, `kick`) dikirim oleh server Socket.io di `backend/src/socket.ts`.

---

## 🧭 Setup Awal Console (First-Run Wizard)

Saat database **belum punya akun admin**, console (`bun run console:dev`, port 1430) otomatis menampilkan **Setup Wizard** alih-alih halaman login:

1. Isi **identitas sekolah** (nama + alamat) dan buat **akun admin pertama**.
2. Opsional: centang **Aktifkan Chat Publik** untuk menyalakan ruang obrolan siswa sejak awal.
3. Selesai → otomatis login ke workspace admin.

Begitu admin pertama dibuat, endpoint setup **mengunci diri** (`409`) sehingga aman dibiarkan ter-mount. Deteksi first-run = "belum ada user `role=admin`" — admin **hanya** lahir dari wizard ini atau dari `bun run seed`.

**Mensimulasikan instalasi baru:**

```bash
cd backend
bun run migrate        # skema bersih
bun run seed:demo      # 4 siswa / 2 group + 1 exam, TANPA admin
# (opsional) redis-cli FLUSHALL  &&  hapus azhura-config.json klien Tauri
bun run dev            # buka console → Setup Wizard muncul
```

Endpoint terkait: `GET /api/setup/status` (`{ needsSetup }`) dan `POST /api/setup`. `GET /api/info` (nama/alamat sekolah untuk wizard koneksi klien siswa) kini bersumber dari tabel `settings` — sumber kebenaran yang sama dengan halaman **Pengaturan** console. Default global **anti-cheat kini aktif** dan dapat diubah di Pengaturan. Detail kontrak: lihat `API_CONTRACT.md`.

---

## ⚙️ Konfigurasi Environment (apps/student)

Salin `apps/student/.env.example` → `apps/student/.env.local`. Backend punya env sendiri di `backend/.env.local`.

| Variabel | Deskripsi | Default Dev | Produksi |
| :--- | :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Endpoint HTTP API; URL Socket.io diturunkan dari origin-nya (`/ws`). | `http://localhost:3000/api` | `https://api.sekolah.sch.id/api` |
| `VITE_ANTI_CHEAT_ENABLED` | Master anti-cheat. | `false` | `true` |
| `VITE_ANTI_CHEAT_FULLSCREEN` | Memaksa fullscreen. | `false` | `true` |
| `VITE_ANTI_CHEAT_BLOCK_SHORTCUTS` | Memblokir devtools, refresh, klik kanan. | `false` | `true` |
| `VITE_ANTI_CHEAT_DETECT_FOCUS_LOSS` | Mencatat event Alt+Tab. | `false` | `true` |
| `VITE_ANTI_CHEAT_DETECT_MULTI_MONITOR` | Memperingatkan multi-monitor. | `false` | `true` |
| `VITE_ANTI_CHEAT_BLOCK_OS_KEYBOARD` | Menelan Alt+Tab/Win/Ctrl+Esc/PrintScreen via low-level hook (Windows saja; no-op di OS lain & web). | `false` | `true` |

> 💡 Set `VITE_ANTI_CHEAT_ENABLED=true` untuk menguji proteksi keyboard, fullscreen, dan deteksi blur langsung di browser.

---

## 📚 Dokumentasi Lain

- `CLAUDE.md` — Panduan arsitektur & alur kerja untuk Claude Code.
- `API_CONTRACT.md` — Spesifikasi API HTTP & WebSocket.
- `AGENT_PROMPT_CBT_SCAFFOLDING.md` — Panduan prompting agen AI untuk codebase ini.
