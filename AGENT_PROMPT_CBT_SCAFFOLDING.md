# Prompt untuk AI Agent: Tauri CBT App Scaffolding
## Context: Dependencies Sudah Ter-Setup, Tinggal Implementasi

Bantu aku scaffold aplikasi ujian berbasis komputer (CBT) dengan Tauri. **Project structure & dependencies sudah ter-setup, tugas kamu adalah bikin boilerplate/template code** yang siap pakai untuk feature development.

---

## Konteks Teknis
- **React**: 19+ dengan jsx runtime
- **Tauri**: 2.x (Rust backend)
- **Package manager**: Bun
- **State management**: Zustand
- **UI**: shadcn/ui + TailwindCSS
- **HTTP client**: axios dengan interceptor
- **WebSocket**: socket.io-client
- **Database**: SQLite via @tauri-apps/plugin-sql
- **Secure storage**: @tauri-apps/plugin-stronghold (untuk JWT/token)
- **Form handling**: react-hook-form + zod
- **Routing**: react-router-dom v6+

---

## Feature Requirements

### 1. Authentication (NIS + Random Password)
- **Halaman login** dengan form:
  - Input NIS (username siswa)
  - Input Password
  - Tombol login
  - Error message handling
- **Backend contract** (untuk server nanti):
  - POST `/auth/login` → { nis, password } → { token, userId, examSessionId }
- **Token storage**: JWT disimpan di Tauri's @tauri-apps/plugin-stronghold (encrypted)
- **Protected routes**: kalau nggak ada token valid, redirect ke login
- **Mock implementation** (dev mode): 2-3 user dummy:
  - NIS: `12345`, password: `student@123`
  - NIS: `67890`, password: `student@123`

### 2. Exam Dashboard & Session Management
- **Halaman utama**: show informasi sesi ujian (nama ujian, durasi, sisa waktu, jumlah soal)
- **Start exam button**: buka halaman ujian
- **Auto-logout**: saat sesi berakhir (timer countdown habis) atau force logout dari server
- **Session state** di Zustand:
  - `examSessionId`, `userId`, `examTitle`, `totalQuestions`, `startTime`, `endTime`, `timeRemaining`
  - Actions: `setExamSession()`, `logout()`, `handleSessionEnd()`

### 3. Exam Question Page (Pilihan Ganda Saja)
- **Tampilan soal**:
  - Soal text (dari data)
  - 4-5 opsi jawaban (radio button via shadcn/ui RadioGroup)
  - Visual status per soal: belum dijawab (abu-abu), sudah dijawab (biru), flag/ragu (kuning)
- **Navigation**:
  - Tombol "Sebelumnya" & "Selanjutnya"
  - Grid nomor soal (clickable, jump ke soal tertentu)
  - Tombol "Flag soal" (untuk marking ragu-ragu)
- **Auto-save jawaban**:
  - Setiap jawaban ke-save langsung ke:
    1. Zustand store (`useExamStore`)
    2. SQLite lokal (via @tauri-apps/plugin-sql, untuk offline support)
  - Timestamp per jawaban untuk conflict resolution nanti
- **Timer countdown**:
  - Display sisa waktu ujian (HH:MM:SS)
  - Update tiap detik
  - Warn saat < 5 menit tersisa (toast notification via sonner)
  - Force submit saat timer habis
- **Backend contract** (untuk server nanti):
  - GET `/exams/:examId/questions` → list soal
  - POST `/exams/:examId/answer` → { questionId, selectedAnswerId, timestamp }
  - GET `/exams/:examId/status` → { timeRemaining, ... }
- **Mock implementation** (dev mode):
  - 10 soal dummy di `src/mocks/data/questions.ts`
  - Timer logic berjalan offline (nggak perlu server)
  - MSW handler untuk GET questions

### 4. Submit Exam & Result Page
- **Konfirmasi submit** (AlertDialog shadcn):
  - "Yakin ingin submit ujian? Tidak bisa dirubah lagi."
  - Tombol "Cancel" & "Submit"
- **Halaman hasil**:
  - Menampilkan score, jumlah benar/salah/kosong
  - Tombol "Selesai" → logout & kembali ke login
- **Backend contract**:
  - POST `/exams/:examId/submit` → { answers } → { score, totalCorrect, ... }
- **Mock implementation**: hardcoded score calculation

### 5. Zustand Store Structure
Buat stores di `src/stores/`:

```
auth.ts
├── useAuthStore
│   ├── token, userId, isAuthenticated
│   ├── login(nis, password)
│   ├── logout()
│   └── validateToken()

exam.ts
├── useExamStore
│   ├── examSessionId, examTitle, totalQuestions
│   ├── questions, currentQuestionIndex, answers, flaggedQuestions
│   ├── startTime, endTime, timeRemaining
│   ├── setExamSession(), setCurrentQuestion(), submitAnswer()
│   ├── flagQuestion(), unflagQuestion()
│   ├── submitExam()
│   └── persist: answers & flaggedQuestions ke SQLite

connectivity.ts
├── useConnectivityStore
│   ├── isOnline, isSyncing, pendingAnswers
│   ├── setOnline(), syncAnswers()

socket.ts
├── useSocketStore
│   ├── isConnected, lastServerMessage
│   ├── handleSocketEvent()

anti-cheat.ts
├── useAntiCheatStore
│   ├── config (master enabled, per-feature flags)
│   ├── detectedCheats (log events)
│   ├── toggleFeature(), logCheatEvent()
│   └── Dev mode: semua off by default
```

### 6. File Structure to Create

```
src/
├── components/
│   ├── auth/
│   │   └── LoginForm.tsx          ← form login dengan react-hook-form + zod
│   ├── exam/
│   │   ├── ExamLayout.tsx          ← top-level exam container
│   │   ├── QuestionRenderer.tsx    ← soal + opsi jawaban
│   │   ├── NavigationPanel.tsx     ← prev/next & grid soal
│   │   ├── TimerDisplay.tsx        ← countdown timer
│   │   ├── ExamSidebar.tsx         ← status summary (belum/sudah/flag)
│   │   ├── SubmitConfirmation.tsx  ← AlertDialog
│   │   └── ResultPage.tsx          ← hasil ujian
│   └── layout/
│       └── AuthLayout.tsx          ← login page layout
│
├── hooks/
│   ├── useExamTimer.ts            ← countdown logic
│   └── useSocketEvent.ts          ← socket listener hook
│
├── lib/
│   ├── api.ts                     ← axios instance + interceptor
│   ├── socket.ts                  ← socket.io client singleton
│   ├── socket.mock.ts             ← mock socket (dev)
│   ├── storage.ts                 ← SQLite wrapper
│   └── anti-cheat-config.ts       ← config logic
│
├── mocks/
│   ├── handlers/
│   │   ├── auth.ts                ← POST /auth/login
│   │   └── exam.ts                ← GET /exams/questions, POST /exams/answer
│   ├── data/
│   │   ├── users.ts               ← dummy users
│   │   └── questions.ts           ← 10 soal dummy
│   └── browser.ts                 ← MSW setup
│
├── routes/
│   └── index.tsx                  ← route definitions (Login, Dashboard, Exam, Result)
│
├── stores/
│   ├── auth.ts
│   ├── exam.ts
│   ├── connectivity.ts
│   ├── socket.ts
│   └── anti-cheat.ts
│
├── types/
│   └── index.ts                   ← TypeScript interfaces (User, Question, Answer, etc)
│
├── App.tsx
├── main.tsx
└── globals.css

src-tauri/
├── src/
│   ├── commands/
│   │   ├── auth.rs               ← logout command
│   │   └── storage.rs            ← query SQLite
│   ├── lib.rs
│   └── ...
└── Cargo.toml                      ← pastikan ada plugin-sql & plugin-stronghold
```

### 7. Component Templates (Minimal Implementation)

**LoginForm.tsx**
- Form pakai react-hook-form + zod validation
- Input NIS (required), Password (required)
- Submit button dengan loading state
- Error message display
- Call `useAuthStore().login()` on submit
- Redirect to exam dashboard saat berhasil

**ExamLayout.tsx**
- Layout: sidebar kiri (status soal) + main (soal + timer + nav)
- Sidebar: grid nomor soal dengan color coding (belum/sudah/flag)
- Top bar: timer countdown + info ujian
- Main content: QuestionRenderer + NavigationPanel

**QuestionRenderer.tsx**
- Display: soal text + RadioGroup (4-5 opsi)
- On select: call `useExamStore().submitAnswer()`
- Mark sebagai "sudah dijawab" di sidebar

**NavigationPanel.tsx**
- Tombol prev/next dengan disabled logic
- Tombol "Flag soal" (toggle)
- Tombol "Kumpulkan" (submit all) → trigger SubmitConfirmation

**TimerDisplay.tsx**
- useExamTimer hook untuk countdown
- Update tiap detik
- Warn saat < 5 menit
- Auto-submit saat habis

**ResultPage.tsx**
- Display: score, total soal, benar/salah/kosong
- Tombol selesai (logout & redirect login)

### 8. .env Variables Needed

```
VITE_API_BASE_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000
VITE_USE_MOCK=true
VITE_ANTI_CHEAT_ENABLED=false
VITE_ANTI_CHEAT_FULLSCREEN=false
VITE_ANTI_CHEAT_BLOCK_SHORTCUTS=false
VITE_ANTI_CHEAT_DETECT_FOCUS_LOSS=false
VITE_ANTI_CHEAT_DETECT_MULTI_MONITOR=false
```

### 9. TypeScript Types (src/types/index.ts)

```typescript
export interface User {
  id: string
  nis: string
  name: string
}

export interface Question {
  id: string
  text: string
  options: {
    id: string
    text: string
  }[]
  correctAnswerId?: string // server only
}

export interface ExamAnswer {
  questionId: string
  selectedOptionId: string | null
  timestamp: number
  isFlagged: boolean
}

export interface ExamSession {
  id: string
  examId: string
  userId: string
  startTime: number
  endTime: number
  totalQuestions: number
  examTitle: string
}

export interface ExamResult {
  score: number
  totalCorrect: number
  totalWrong: number
  totalEmpty: number
}
```

### 10. Deliverables

Harus ada:
1. ✅ Semua component files siap pakai (dengan TODO comment untuk server integration)
2. ✅ Zustand stores fully typed
3. ✅ Type definitions lengkap
4. ✅ MSW handlers untuk auth & exam (mock)
5. ✅ 10 soal dummy PG di mock data
6. ✅ Router setup (Login → Dashboard → Exam → Result)
7. ✅ End-to-end flow bisa jalan dari login sampai submit dengan mock
8. ✅ README update: dev flow, struktur, cara switch ke real API nanti
9. ✅ API_CONTRACT.md: dokumentasi endpoint & response shape
10. ✅ .env.example dengan semua variable

---

## Implementation Notes

- **Dev mode**: anti-cheat off, mock on
- **Production**: anti-cheat on (nanti), real API
- **Database**: SQLite untuk cache answers (offline support, bukan persistent state)
- **Security**: token selalu di stronghold, bukan di plain localStorage
- **Error handling**: try-catch semua async ops, tampilkan toast error via sonner
- **TypeScript**: strict mode, no any

---

## Execution Plan

Konfirmasi checklist ini dulu sebelum mulai:
- [ ] Dependencies semua installed (via setup script)
- [ ] Path alias @/* sudah configured (tsconfig.json, vite.config.ts)
- [ ] shadcn/ui components sudah di-add
- [ ] Siap create folder structure & files
- [ ] Siap implement components & stores

Setelah konfirmasi, buat files dalam urutan:
1. Types
2. Stores (auth → exam → connectivity → socket → anti-cheat)
3. Lib (api, socket, storage, anti-cheat-config)
4. Mocks (handlers, data, browser setup)
5. Hooks (useExamTimer, useSocketEvent)
6. Components (auth → layout → exam)
7. Routes
8. Update App.tsx & main.tsx
9. README & API_CONTRACT.md

Setiap file harus punya JSDoc comment & TODO markers jelas.
