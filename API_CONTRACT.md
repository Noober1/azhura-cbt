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
Menampilkan pesan peringatan mengambang dari pengawas di layar siswa.
*   **Event Name**: `alert-message`
*   **Payload Shape**:
    ```json
    {
      "message": "Ujian tersisa 10 menit. Periksa kembali jawaban Anda!"
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
