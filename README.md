# Azhura CBT Exam Client (Tauri + React + TS)

Azhura CBT (Computer-Based Test) adalah aplikasi klien ujian desktop native super aman yang dibangun di atas **Tauri 2.x** dengan frontend **React 19**, **Zustand**, **Tailwind CSS v4**, dan **shadcn/ui**. 

Aplikasi ini dilengkapi dengan integrasi **Mock Service Worker (MSW v2)** dan **Socket.io Mock** untuk memfasilitasi pengujian alur kerja end-to-end tanpa memerlukan koneksi server backend nyata selama fase pengembangan.

---

## 🚀 Fitur Utama

1. **Autentikasi Aman & Handal**: Login berbasis NIS dan password ujian. Dilengkapi token management yang siap diintegrasikan dengan **Tauri Stronghold** untuk enkripsi tingkat tinggi di memori.
2. **Offline-First Answer Cache (SQLite & LocalStorage)**: Setiap jawaban yang dipilih siswa otomatis tersimpan seketika ke database lokal (SQLite via `@tauri-apps/plugin-sql` jika berjalan di native frame, atau fallback ke `localStorage` jika dibuka di browser standar).
3. **Sinkronisasi Otomatis (Connectivity Queue)**: Jika siswa mendadak kehilangan koneksi internet, jawaban tetap aman tersimpan offline. Ketika koneksi pulih, background sync queue otomatis mengunggah seluruh jawaban tertunda secara berurutan.
4. **Sistem Pengawasan Real-time (WebSocket)**: Mendukung push notifications pengawas (broadcast alerts), force logout (kick), dan force submission dari panel supervisor.
5. **Keamanan Ujian Tinggi (Anti-Cheat Engine)**:
   - **Fullscreen Lock**: Memaksa aplikasi berjalan dalam layar penuh (fullscreen).
   - **Focus Monitoring (Alt-Tab Detection)**: Mendeteksi jika siswa menab-out atau membuka jendela lain.
   - **Keyboard Shortcut Blocker**: Memblokir pintasan terlarang (F12, refresh halaman, copy-paste, klik kanan, dll).

---

## 📂 Struktur Folder Scaffold

```
src/
├── components/
│   ├── auth/
│   │   └── LoginForm.tsx          # Form login dengan react-hook-form + zod validation
│   ├── exam/
│   │   ├── ExamLayout.tsx          # Container layout utama (Sidebar + Soal + Topbar)
│   │   ├── QuestionRenderer.tsx    # Penampil soal & opsi radio button
│   │   ├── NavigationPanel.tsx     # Kontrol navigasi (Sebelumnya, Ragu-ragu, Kumpulkan)
│   │   ├── TimerDisplay.tsx        # Indikator countdown (HH:MM:SS) dengan blinking alert
│   │   ├── ExamSidebar.tsx         # Grid status nomor soal (belum/terjawab/ragu)
│   │   └── SubmitConfirmation.tsx  # Modal AlertDialog konfirmasi pengumpulan ujian
│   │   └── ResultPage.tsx          # Tampilan skor akhir dan breakdown statistik
│   └── layout/
│       └── AuthLayout.tsx          # Layout landing login dengan visual premium
│
├── hooks/
│   ├── useExamTimer.ts            # Hook timer & auto-submit saat waktu habis
│   └── useSocketEvent.ts          # Hook listener socket dengan auto-cleanup
│
├── lib/
│   ├── api.ts                     # Axios instance dengan JWT injection & 401 auto-logout interceptor
│   ├── socket.ts                  # Integrasi Socket.io real-time client
│   ├── socket.mock.ts             # Mock socket emitter untuk memicu event pengawas dari console
│   ├── storage.ts                 # Wrapper hybrid SQLite & LocalStorage fallback
│   └── anti-cheat-config.ts       # Controller listeners pendeteksi kecurangan
│
├── mocks/
│   ├── data/
│   │   ├── users.ts               # List kredensial 3 siswa dummy
│   │   └── questions.ts           # 10 soal ujian tiruan pilihan ganda lengkap
│   ├── handlers/
│   │   ├── auth.ts                # MSW http handler untuk auth endpoints
│   │   └── exam.ts                # MSW http handler untuk exam endpoints & scoring
│   └── browser.ts                 # Inisialisasi MSW worker browser
│
├── routes/
│   └── index.tsx                  # Konfigurasi HashRouter & halaman dasbor ujian
│
├── stores/                        # Zustand Global State Management
│   ├── auth.ts                    # State autentikasi & token
│   ├── exam.ts                    # State lembar soal & SQLite persistence
│   ├── connectivity.ts            # State jaringan & syncing queue
│   ├── socket.ts                  # State real-time websocket status
│   └── anti-cheat.ts              # State logs pelanggaran siswa
│
├── App.tsx                        # Root layout & Sonner Toast container
└── main.tsx                       # Bootstrap & penyiapan MSW dev environment
```

---

## 🛠️ Panduan Pengembangan (Developer Flow)

### 1. Kredensial Siswa Dummy (Mock Mode)

Gunakan kombinasi kredensial berikut untuk login di halaman utama:
*   **NIS**: `12345` | **Password**: `student@123` *(Nama: Ahmad Faisal)*
*   **NIS**: `67890` | **Password**: `student@123` *(Nama: Budi Santoso)*
*   **NIS**: `99999` | **Password**: `student@123` *(Nama: Citra Lestari)*

### 2. Menguji Event Real-time Pengawas (WebSockets)

Kami telah mendaftarkan objek pembantu global `window.mockSocket` di browser konsol untuk memudahkan Anda melakukan simulasi tindakan pengawas dari server:
1.  Buka console developer tools (F12) pada browser saat berada di halaman pengerjaan ujian.
2.  **Kirim Pesan Pengawas**:
    ```javascript
    window.mockSocket.triggerAlert("Harap tenang, ujian tinggal 10 menit lagi!");
    ```
3.  **Keluarkan Siswa Secara Paksa (Kick)**:
    ```javascript
    window.mockSocket.triggerKick("Melakukan pelanggaran berat.");
    ```
4.  **Kumpulkan Jawaban Secara Paksa**:
    ```javascript
    window.mockSocket.triggerForceSubmit();
    ```

---

## ⚙️ Konfigurasi Environment & Peralihan ke Production

Salin file `.env.example` menjadi `.env.local` untuk mengonfigurasi perilaku aplikasi:

```bash
cp .env.example .env.local
```

### Penjelasan Variabel:

| Variabel | Deskripsi | Default Dev | Produksi |
| :--- | :--- | :--- | :--- |
| `VITE_USE_MOCK` | Mengaktifkan MSW dan mock socket. | `true` | `false` |
| `VITE_API_BASE_URL` | Endpoint HTTP API server pusat. | `http://localhost:3000/api` | `https://api.sekolah.sch.id/api` |
| `VITE_SOCKET_URL` | Endpoint websocket server pusat. | `http://localhost:3000` | `https://api.sekolah.sch.id` |
| `VITE_ANTI_CHEAT_ENABLED` | Mengaktifkan anti-cheat master. | `false` | `true` |
| `VITE_ANTI_CHEAT_FULLSCREEN` | Memaksa fullscreen. | `false` | `true` |
| `VITE_ANTI_CHEAT_BLOCK_SHORTCUTS`| Memblokir devtools, refresh, klik kanan.| `false` | `true` |
| `VITE_ANTI_CHEAT_DETECT_FOCUS_LOSS`| Mencatat event Alt+Tab siswa. | `false` | `true` |

> 💡 **Tips Pengujian Anti-Cheat**: Set `VITE_ANTI_CHEAT_ENABLED=true` pada `.env.local` Anda untuk menguji proteksi keyboard, layar penuh, dan blur deteksi secara langsung di browser lokal Anda!

---

## 🏃 Running Commands

**Menjalankan Local Dev Server (Web Browser)**:
```bash
bun run dev
```

**Membangun Bundle Client Produksi**:
```bash
bun run build
```

**Menjalankan Tauri Desktop Developer Frame**:
```bash
bun run tauri dev
```

**Membangun Aplikasi Native Installer (.exe / .msi)**:
```bash
bun run tauri build
```
