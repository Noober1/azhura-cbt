# API Contract Specification

Dokumen ini mendefinisikan kontrak komunikasi HTTP API antara aplikasi CBT Client (Tauri Desktop/Web) dan Central Exam Server. Seluruh request dan response wajib menggunakan format **Content-Type: application/json**.

---

## 1. Authentication Endpoints

### 1.1 POST `/auth/login`
Digunakan untuk melakukan autentikasi siswa masuk ke dalam sistem CBT.

*   **URL**: `/api/auth/login`
*   **Method**: `POST`
*   **Request Body**:
    ```json
    {
      "nis": "12345",
      "password": "student@123"
    }
    ```
*   **Response (200 OK - Sukses)**:
    ```json
    {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "userId": "usr_1001",
      "user": {
        "id": "usr_1001",
        "nis": "12345",
        "name": "Ahmad Faisal"
      }
    }
    ```
*   **Response (401 Unauthorized - Gagal)**:
    ```json
    {
      "message": "NIS atau password salah."
    }
    ```

---

### 1.2 GET `/auth/validate`
Digunakan untuk memvalidasi token JWT saat aplikasi pertama kali dimuat (keep-alive/session restore).

*   **URL**: `/api/auth/validate`
*   **Method**: `GET`
*   **Headers**:
    *   `Authorization: Bearer <JWT_TOKEN>`
*   **Response (200 OK - Valid)**:
    ```json
    {
      "valid": true
    }
    ```
*   **Response (401 Unauthorized - Invalid/Expired)**:
    ```json
    {
      "message": "Token tidak valid atau kedaluwarsa."
    }
    ```

---

## 2. Exam Endpoints

### 2.0 GET `/exams`
Digunakan untuk mengambil daftar ujian yang dapat dikerjakan oleh siswa yang sedang login. Ditampilkan sebagai tabel pada halaman dashboard. Endpoint ini **tidak** mengirimkan konten soal apa pun.

*   **URL**: `/api/exams`
*   **Method**: `GET`
*   **Headers**:
    *   `Authorization: Bearer <JWT_TOKEN>`
*   **Response (200 OK - Sukses)**:
    ```json
    [
      {
        "id": "exam_math_101",
        "title": "Ujian Akhir Semester - Matematika",
        "totalQuestions": 10,
        "durationMinutes": 30
      },
      {
        "id": "exam_prog_201",
        "title": "Ujian Akhir Semester - Pemrograman & Logika Komputer",
        "totalQuestions": 15,
        "durationMinutes": 45
      }
    ]
    ```
    > Daftar ini sebaiknya difilter di sisi server sesuai hak akses/penjadwalan siswa. Field `durationMinutes` dipakai klien hanya untuk tampilan; durasi sesungguhnya dikunci server lewat `startTime`/`endTime` saat sesi dibuat.

---

### 2.1 GET `/exams/:examId/questions`
Digunakan untuk mengunduh seluruh lembar daftar soal ujian.

*   **URL**: `/api/exams/:examId/questions`
*   **Method**: `GET`
*   **Headers**:
    *   `Authorization: Bearer <JWT_TOKEN>`
*   **Response (200 OK - Sukses)**:
    ```json
    [
      {
        "id": "q_1",
        "text": "Manakah di bawah ini yang merupakan fungsi utama dari package manager 'Bun'?",
        "options": [
          { "id": "opt_1_a", "text": "Mengompilasi kode Rust menjadi biner desktop native" },
          { "id": "opt_1_b", "text": "Menjadi runtime, bundler, test runner, dan package manager JavaScript/TypeScript yang super cepat" },
          { "id": "opt_1_c", "text": "Sebagai emulator database relasional secara virtual" },
          { "id": "opt_1_d", "text": "Menyediakan server WebSocket global secara otomatis" }
        ]
      },
      {
        "id": "q_2",
        "text": "Dalam arsitektur Tauri 2.x, apa fungsi utama dari Rust backend?",
        "options": [
          { "id": "opt_2_a", "text": "Merender tampilan visual antarmuka pengguna (UI)" },
          { "id": "opt_2_b", "text": "Menangani operasi tingkat sistem yang aman, akses file native, dan manajemen window" },
          { "id": "opt_2_c", "text": "Menggantikan fungsionalitas React router secara penuh" },
          { "id": "opt_2_d", "text": "Melakukan enkripsi biner HTML di sisi klien saja" }
        ]
      }
    ]
    ```
    > ⚠️ *Catatan Produksi*: Kolom kunci jawaban (`correctAnswerId`) **tidak boleh dikirimkan** oleh server pada endpoint ini demi menjaga keamanan dari tindakan kecurangan siswa (inspect element/memory reading).

---

### 2.2 POST `/exams/:examId/answer`
Mengirimkan satu jawaban siswa ke server secara real-time (tiap kali siswa mengklik radio button).

*   **URL**: `/api/exams/:examId/answer` (atau fallback `/api/exams/answer`)
*   **Method**: `POST`
*   **Headers**:
    *   `Authorization: Bearer <JWT_TOKEN>`
*   **Request Body**:
    ```json
    {
      "questionId": "q_1",
      "selectedOptionId": "opt_1_b",
      "timestamp": 1715958210344
    }
    ```
*   **Response (200 OK - Sukses)**:
    ```json
    {
      "success": true,
      "timestamp": 1715958210385
    }
    ```

---

### 2.2b POST `/exams/:examId/answers/batch`
Menyinkronkan **sekumpulan** jawaban antrean dalam satu request idempoten — dipakai klien untuk menguras antrean offline (`connectivity` store) saat kembali online / socket reconnect (#10). Setiap baris di-upsert via unique `(session_id, question_id)`; duplikat dalam satu batch dikecilkan (jawaban dengan `timestamp` terbaru menang). Guard sesi identik dengan `/answer`.

*   **URL**: `/api/exams/:examId/answers/batch`
*   **Method**: `POST`
*   **Headers**:
    *   `Authorization: Bearer <JWT_TOKEN>`
*   **Request Body** (maks. 500 item):
    ```json
    {
      "sessionId": "sess_abc",
      "answers": [
        { "questionId": "q_1", "selectedOptionId": "opt_1_b", "timestamp": 1715958210344 },
        { "questionId": "q_2", "selectedOptionId": null, "timestamp": 1715958220021 }
      ]
    }
    ```
*   **Response (200 OK - Sukses)**:
    ```json
    {
      "success": true,
      "count": 2,
      "timestamp": 1715958210385
    }
    ```
*   **Error**: `404` sesi tak ditemukan, `409` ujian sudah dikumpulkan, `410` waktu ujian habis. Klien men-_drop_ antrean pada `409`/`410`, dan retry (backoff) pada error lain.

---

### 2.3 POST `/exams/:examId/submit`
Menyerahkan lembar jawaban final siswa untuk dikunci dan dinilai secara permanen.

*   **URL**: `/api/exams/:examId/submit`
*   **Method**: `POST`
*   **Headers**:
    *   `Authorization: Bearer <JWT_TOKEN>`
*   **Request Body**:
    ```json
    {
      "answers": [
        { "questionId": "q_1", "selectedOptionId": "opt_1_b", "timestamp": 1715958210344, "isFlagged": false },
        { "questionId": "q_2", "selectedOptionId": "opt_2_b", "timestamp": 1715958220021, "isFlagged": true },
        { "questionId": "q_3", "selectedOptionId": null, "timestamp": 1715958230000, "isFlagged": false }
      ]
    }
    ```
*   **Response (200 OK - Sukses Kalkulasi)**:
    ```json
    {
      "score": 67,
      "totalCorrect": 2,
      "totalWrong": 1,
      "totalEmpty": 7
    }
    ```

---

## 3. Real-time Supervisor Events (WebSockets / Socket.io)

Ketika klien tersambung ke namespace root `/` pada Socket.io server, klien mengirimkan `token` di payload `auth` jabat-tangan (handshake). Server dapat mengontrol sesi ujian klien secara real-time dengan memicu event-event berikut:

### 3.1 Server Emitter: `alert-message`
Menampilkan pesan dari pengawas di layar siswa (#13). `variant` menentukan tampilan: `toast` (notifikasi ringan, default) atau `modal` (dialog yang harus ditutup siswa). Diarahkan ke room sesuai target (lihat §4.5).
*   **Event Name**: `alert-message`
*   **Payload Shape** (`SupervisorMessage` dari `@azhura/shared`):
    ```json
    {
      "message": "Ujian tersisa 10 menit. Periksa kembali jawaban Anda!",
      "variant": "toast"
    }
    ```

### 3.2 Server Emitter: `force-submit`
Memaksa sistem klien untuk mengunci lembar ujian saat itu juga dan mengirimkannya ke server (misal ketika durasi habis di server atau siswa melakukan pelanggaran fatal).
*   **Event Name**: `force-submit`
*   **Payload Shape**:
    ```json
    {
      "reason": "Waktu ujian selesai."
    }
    ```

### 3.3 Server Emitter: `kick`
Mengeluarkan siswa langsung dari sesi ujian dan menghapus seluruh token login (misal jika terbukti melakukan kecurangan berulang).
*   **Event Name**: `kick`
*   **Payload Shape**:
    ```json
    {
      "reason": "Anda terdeteksi melakukan tindakan kecurangan Alt+Tab sebanyak 3 kali."
    }
    ```

### 3.4 Server Emitter: `roster-update` (#7)
Mendorong perubahan inkremental roster ke room `supervisors` (admin/pengawas). Roster mencakup **semua siswa yang login**: yang sedang ujian dan yang **idle di dashboard** (`exam: null`). Konsumen utama: halaman **Status Peserta**. Patch diskriminatif:
*   **Event Name**: `roster-update`
*   **Payload Shape** (`RosterPatch` dari `@azhura/shared`):
    ```jsonc
    // peserta muncul/berpindah grup (login→dashboard, mulai ujian, submit→balik dashboard)
    { "type": "upsert", "participant": { /* RosterParticipant */ } }
    // peserta keluar dari roster (dashboard student disconnect / logout)
    { "type": "remove", "userId": "uuid" }
    // status koneksi exam-taker berubah saat disconnect/reconnect mid-exam
    { "type": "connection", "userId": "uuid", "connection": "disconnected", "lastSeen": 1717500000000 }
    ```

## 4. Supervisor HTTP Endpoints

Semua endpoint di-gate ke role `supervisor`/`admin` (`onBeforeHandle`).

### 4.1 `GET /api/supervisor/roster` (#7)
Backfill roster: gabungan **exam-takers** (sesi `exam_sessions` aktif: belum submit & belum lewat `endTime`) dan **dashboard students** (punya sesi registry aktif tapi tidak sedang ujian). `exam` bernilai `null` untuk peserta di dashboard. Console memanggilnya sekali saat halaman dibuka, lalu live lewat `roster-update`.
*   **Response Shape** (`RosterSnapshot` dari `@azhura/shared`):
    ```jsonc
    {
      "participants": [
        { // sedang ujian
          "userId": "uuid", "nis": "12345", "name": "Ahmad Faisal", "groupName": "Kelas 7A",
          "exam": { "examId": "uuid", "examTitle": "UAS Matematika",
                    "startTime": 1717500000000, "endTime": 1717503600000 },
          "connection": "connected", "lastSeen": 1717500120000
        },
        { // idle di dashboard
          "userId": "uuid2", "nis": "67890", "name": "Budi", "groupName": "Kelas 7B",
          "exam": null, "connection": "connected", "lastSeen": 1717500130000
        }
      ],
      "serverTime": 1717500200000
    }
    ```

### 4.2 `POST /api/supervisor/dashboard-logout` (#7)
Remote-logout siswa yang **idle di dashboard**. Dengan `userId` → logout satu siswa; tanpa `userId` → logout **semua** siswa di dashboard. Siswa yang sedang ujian **ditolak** (guard server-side, bukan hanya UI) — untuk itu pakai kick / remote-submit. Memicu event `kick` ke siswa, melepas sesi registry, dan emit `roster-update` `remove`.
*   **Request Body**: `{ "userId"?: "uuid", "reason"?: "string" }`
*   **Response**: `{ "success": true, "count": 2 }` — jumlah siswa yang ter-logout.
*   **Error**: `400` bila `userId` menunjuk siswa yang sedang mengerjakan ujian.

### 4.3 `POST /api/supervisor/force-submit` (#12)
Remote finish: menyuruh client siswa **mengumpulkan ujian saat itu juga** lalu diarahkan ke halaman hasil (`/result`). Siswa **tetap login** (beda dengan kick). `reason` opsional **ditampilkan ke siswa** (default sopan bila kosong) via event `force-submit`. Tercatat di logger.
*   **Request Body**: `{ "userId": "uuid", "reason"?: "string" }`
*   **Response**: `{ "success": true }`
*   **Catatan**: pengumpulan bersifat client-driven (skor dari response submit ditampilkan di `/result`). Untuk finalisasi yang dijamin server-side meski client offline, gunakan kick (§4.4).

### 4.4 `POST /api/supervisor/kick` (#11)
Kick **server-authoritative**: dalam satu aksi (1) **finalisasi sesi ujian server-side** — menilai jawaban yang sudah tersimpan & menandai `submitted`, berjalan walau client sudah offline; (2) melepas sesi registry (#5, akun bisa login lagi); (3) emit event `kick` (client menampilkan `reason` lalu logout); (4) emit `roster-update` `remove`. Aman juga untuk siswa idle dashboard (tanpa sesi ujian → finalisasi dilewati). Tercatat di logger (audit).
*   **Request Body**: `{ "userId": "uuid", "reason"?: "string" }`
*   **Response**: `{ "success": true, "finalized": true }` — `finalized` true bila ada sesi ujian yang dinilai server-side; false untuk siswa dashboard.

### 4.5 `POST /api/supervisor/alert` (#13)
Broadcast pesan ke siswa dengan **target** dan **tampilan** pilihan. Diarahkan ke room yang tepat (`all` → semua siswa, `user` → `user:{id}`, `group` → tiap `group:{id}`) lewat event `alert-message` (§3.1). Tercatat di logger.
*   **Request Body** (`target` = `BroadcastTarget`, `variant` = `SupervisorMessageVariant`):
    ```jsonc
    {
      "message": "Pengumuman penting",       // wajib, minLength 1
      "variant": "toast",                     // "toast" (default) | "modal"
      "target": { "type": "all" }             // | { "type":"user","userId":"uuid" }
                                              // | { "type":"group","groupIds":["uuid", ...] }
    }
    ```
*   **Response**: `{ "success": true }`
*   **Error**: `400/422` bila `message` kosong atau `target` tidak valid.

### 4.6 `GET /api/supervisor/groups` (#13)
Daftar group (id + nama) untuk pemilih target broadcast. Tersedia untuk `supervisor`/`admin` (berbeda dari CRUD `/admin/groups` yang admin-only).
*   **Response Shape** (`GroupOption[]` dari `@azhura/shared`): `[{ "id": "uuid", "name": "Kelas 7A" }, ...]`
