# API Contract Specification

Kontrak komunikasi antara CBT Client (Tauri Desktop/Web) dan Central Exam Server.
Seluruh request/response HTTP memakai **Content-Type: application/json**.

> **Bentuk data HTTP (request/response, field wajib, tipe, status code) di-generate
> otomatis dari schema `t.Object` tiap route.** Jalankan backend dengan
> `ENABLE_API_DOCS=true` lalu buka **`GET /api/docs`** untuk dokumentasi interaktif
> (Swagger/Scalar, lengkap dengan "try it out"). Docs ini **mati di produksi** secara
> default — route tidak ter-mount (404) kecuali flag di-set (lihat `backend/.env.example`).
>
> Dokumen ini sengaja **tidak** lagi menyalin bentuk request/response yang mekanis
> (rawan basi terhadap kode). Yang dipertahankan di sini adalah hal yang OpenAPI
> **tidak bisa** hasilkan: **event realtime Socket.io (§3)**, **catatan keamanan**, dan
> **invarian perilaku** (idempotensi, state machine sesi, otoritas server vs client).

---

## 1. Authentication Endpoints

| Endpoint | Method | Auth | Tujuan |
|---|---|---|---|
| `/api/auth/login` | POST | — | Autentikasi siswa (NIS + password) → JWT. |
| `/api/auth/validate` | GET | Bearer | Validasi token saat app dimuat (session restore). |

Bentuk request/response: lihat `/api/docs`.

---

## 2. Exam Endpoints

| Endpoint | Method | Auth | Tujuan |
|---|---|---|---|
| `/api/exams` | GET | Bearer | Daftar ujian yang boleh dikerjakan caller (di-scope per grup untuk siswa). Tanpa konten soal. |
| `/api/exams/:examId/questions` | GET | Bearer | Ambil daftar soal ujian. |
| `/api/exams/:examId/answer` | POST | Bearer | Kirim satu jawaban (upsert idempoten per soal). |
| `/api/exams/:examId/answers/batch` | POST | Bearer | Flush sekumpulan jawaban antrean (sinkronisasi offline-first). |
| `/api/exams/:examId/sessions` | POST | Bearer | Buat sesi ujian bertenggat (divalidasi per grup). |
| `/api/exams/:examId/submit` | POST | Bearer | Pengumpulan & penilaian final. |

Bentuk request/response: lihat `/api/docs`. Catatan perilaku & keamanan yang **wajib**
dipatuhi (tidak ter-cover OpenAPI):

- **🔒 Kunci jawaban tidak pernah dikirim ke klien.** `GET /exams/:examId/questions`
  **tidak boleh** menyertakan `correctAnswerId` (atau field jawaban untuk tipe non-MC) —
  demi mencegah kecurangan via inspect element / memory reading. Penilaian murni server-side.
- **Durasi dikunci server.** `durationMinutes` di `/exams` hanya untuk tampilan; durasi
  sesungguhnya ditentukan `startTime`/`endTime` sesi yang dibuat server, bukan dari klien.
- **Idempotensi & dedup batch.** `/answers/batch` (maks. 500 item) meng-upsert tiap baris
  via unique `(session_id, question_id)`. Duplikat dalam satu batch dikecilkan: jawaban
  dengan **`timestamp` terbaru menang**. Guard sesi identik dengan `/answer`.
- **Penanganan error antrean (klien).** `404` sesi tak ditemukan; `409` ujian sudah
  dikumpulkan; `410` waktu ujian habis. Klien men-**drop** antrean pada `409`/`410`
  (terminal, tak ada gunanya retry) dan **retry dengan backoff** pada error lain.

---

## 3. Real-time Supervisor Events (WebSockets / Socket.io)

> **Tetap manual — OpenAPI hanya mencakup HTTP, event realtime nol ter-cover.**

Saat klien tersambung ke namespace root `/` Socket.io, klien mengirim `token` di payload
`auth` saat handshake. Server mengontrol sesi ujian klien secara real-time lewat event berikut.

### 3.1 Server Emitter: `alert-message`
Menampilkan pesan pengawas di layar siswa (#13). `variant` menentukan tampilan: `toast`
(notifikasi ringan, default) atau `modal` (dialog yang harus ditutup siswa). Diarahkan ke
room sesuai target (lihat §4 `/supervisor/alert`).
*   **Payload** (`SupervisorMessage` dari `@azhura/shared`):
    ```json
    { "message": "Ujian tersisa 10 menit. Periksa kembali jawaban Anda!", "variant": "toast" }
    ```

### 3.2 Server Emitter: `force-submit`
Memaksa klien mengunci lembar ujian saat itu juga lalu mengumpulkannya (mis. durasi habis
di server atau pelanggaran fatal). **Client-driven** — lihat kontras dengan `kick` di §4.
*   **Payload**: `{ "reason": "Waktu ujian selesai." }`

### 3.3 Server Emitter: `kick`
Mengeluarkan siswa dari sesi ujian dan menghapus token login (mis. kecurangan berulang).
*   **Payload**: `{ "reason": "Anda terdeteksi melakukan Alt+Tab sebanyak 3 kali." }`

### 3.4 Server Emitter: `roster-update` (#7)
Mendorong perubahan **inkremental** roster ke room `supervisors`. Roster mencakup **semua
siswa yang login**: yang sedang ujian dan yang **idle di dashboard** (`exam: null`).
Konsumen utama: halaman **Status Peserta**. Patch diskriminatif (`RosterPatch`):
```jsonc
// peserta muncul/berpindah grup (login→dashboard, mulai ujian, submit→balik dashboard)
{ "type": "upsert", "participant": { /* RosterParticipant */ } }
// peserta keluar dari roster (dashboard student disconnect / logout)
{ "type": "remove", "userId": "uuid" }
// status koneksi exam-taker berubah saat disconnect/reconnect mid-exam
{ "type": "connection", "userId": "uuid", "connection": "disconnected", "lastSeen": 1717500000000 }
```

> Event realtime lain yang aktif (lihat `@azhura/shared`): `time-change` (#8, perubahan
> sisa waktu), `heartbeat:ping`/`heartbeat:pong` (#9, liveness), `anti-cheat-violation`
> (#126, push pelanggaran ke pengawas), dan event chat publik `chat:*` (#17). Payloadnya
> didefinisikan sebagai tipe di `@azhura/shared`.

---

## 4. Supervisor HTTP Endpoints

Semua di-gate ke role `supervisor`/`admin` via `onBeforeHandle`. Bentuk request/response:
lihat `/api/docs`. Yang dipertahankan di sini adalah **semantik perilaku** yang krusial.

| Endpoint | Method | Tujuan singkat |
|---|---|---|
| `/api/supervisor/roster` | GET | Backfill roster (gabungan exam-takers + dashboard students). |
| `/api/supervisor/dashboard-logout` | POST | Remote-logout siswa **idle di dashboard**. |
| `/api/supervisor/force-submit` | POST | Remote finish (client-driven). |
| `/api/supervisor/kick` | POST | Kick **server-authoritative** (finalisasi + lepas sesi). |
| `/api/supervisor/alert` | POST | Broadcast pesan ke siswa (target + variant). |
| `/api/supervisor/groups` | GET | Daftar group untuk pemilih target broadcast. |

**Invarian perilaku (wajib dipahami):**

- **`force-submit` (client-driven) vs `kick` (server-authoritative).** `force-submit` (#12)
  menyuruh client mengumpulkan saat itu juga lalu diarahkan ke `/result`; siswa **tetap
  login**; skor dihitung dari response submit klien — **butuh client online**. `kick` (#11)
  dalam satu aksi: (1) **finalisasi sesi server-side** (menilai jawaban tersimpan + tandai
  `submitted`, **jalan walau client offline**), (2) lepas sesi registry (akun bisa login
  lagi), (3) emit `kick`, (4) emit `roster-update` `remove`. Untuk finalisasi yang dijamin
  meski client offline, **pakai kick**.
- **`dashboard-logout` hanya untuk siswa idle.** Dengan `userId` → satu siswa; tanpa
  `userId` → **semua** siswa di dashboard. Siswa yang **sedang ujian ditolak** (guard
  server-side, bukan sekadar UI; `400`) — untuk itu pakai force-submit / kick.
- **Routing broadcast `alert`.** `target.type`: `all` → semua siswa, `user` → room
  `user:{id}`, `group` → tiap room `group:{id}`. Disalurkan lewat event `alert-message` (§3.1).
- Semua aksi pengawas tercatat di logger (audit).
