# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Azhura CBT** is a secure, offline-capable Computer-Based Test (CBT) system for Indonesian schools. It is a **Bun-workspaces monorepo** containing two frontends and a backend:

- **`apps/student`** — the exam client: **Tauri 2.x** (desktop) + **React 19** + **TypeScript** + **Zustand**, locked-down (anti-cheat, fullscreen, offline-first, encrypted credential storage). Installed on exam workstations.
- **`apps/console`** — the admin + supervisor web app (Vite + React 19, role-gated): question authoring, imports, recaps, live proctoring, and settings. Further features continue under the admin epic (#6) and proctoring work (Fase 4).
- **`packages/shared`** — shared domain types (and, going forward, zod schemas, api-client, socket-client). Single source of truth so the two frontends never drift.
- **`backend`** — **Elysia + Bun** API: MySQL/MariaDB via **Drizzle ORM**, **Socket.io** realtime, **JWT** auth (`@elysiajs/jwt`), bcrypt.

> **Why the split:** admin/management code must NOT bundle into the student exam client (attack surface), and Tauri is the wrong delivery vehicle for the admin console (needs browser access + instant deploy). See `packages/shared` for the contract that keeps both sides aligned.

## Repository Layout

```
azhura-exam/                       # workspace root — bun workspaces, orchestration scripts
├── apps/
│   ├── student/                   # pkg: azhura-student  (Tauri + React exam client)
│   │   ├── src/                   # React app (see "Student App Structure")
│   │   ├── src-tauri/             # Rust/Tauri shell (config uses paths relative to here)
│   │   ├── index.html, vite.config.ts, tsconfig*.json
│   │   ├── components.json        # shadcn/ui config
│   │   └── .env, .env.example, .env.local
│   └── console/                   # pkg: azhura-console  (admin + supervisor web app)
│       ├── src/                   # App.tsx, main.tsx, index.css
│       ├── index.html, vite.config.ts (dev port 1430), tsconfig*.json
├── packages/
│   └── shared/                    # pkg: @azhura/shared  (no build step; consumed as TS source)
│       └── src/
│           ├── index.ts           # public entrypoint — import from "@azhura/shared"
│           └── types/index.ts     # domain models (User, Question, ExamSession, …)
├── backend/                       # pkg: azhura-exam-backend  (Elysia API)
│   └── src/
│       ├── index.ts, socket.ts, migrate.ts, seed.ts
│       ├── db/                    # Drizzle schema, client
│       ├── routes/                # auth, exam
│       ├── middleware/            # requireAuth (JWT plugin)
│       └── lib/                   # errors, logger, env
├── package.json                   # root: workspaces + scripts
└── bun.lock                       # single lockfile (stays at root)
```

## Development Commands

All commands run from the **repo root** and delegate to a workspace via `bun --filter`:

```bash
bun install                  # install all workspaces, link @azhura/shared into each app

# Student exam client (apps/student)
bun run dev                  # Vite dev server (web, port 1420)
bun run build                # tsc + vite build → apps/student/dist
bun run tauri:dev            # Tauri desktop, hot reload (native frame)
bun run tauri:build          # native installer (.exe / .msi / .dmg / .AppImage)

# Admin/supervisor console (apps/console)
bun run console:dev          # Vite dev server (web, port 1430)
bun run console:build        # tsc + vite build → apps/console/dist

# Backend API (backend)
bun run backend:dev          # Elysia hot-reload server
bun run backend:start        # Elysia (no watch)
```

Backend-local DB tasks (run from `backend/`): `bun run seed`, `bun run migrate`, `bun run db:generate`, `bun run db:push`, `bun run db:studio`.

> **Note on `bun --filter`:** the working form is `bun --filter <pkg> <script>` (used by the root scripts above). The bare `bun --filter <pkg> run` / `exec` forms do **not** match in this setup. You can also `cd` into a workspace and run its script directly.

## Student App Structure (`apps/student/src`)

```
src/
├── components/
│   ├── auth/           # LoginForm
│   ├── dashboard/      # DashboardPage, DashboardNavbar, ExamListTable, ParticipantCard, StartExamDialog
│   ├── exam/           # ExamLayout, QuestionRenderer, TimerDisplay, ExamSidebar, NavigationPanel, SubmitConfirmation, ResultPage
│   ├── layout/         # AuthLayout
│   └── ui/             # shadcn/ui primitives
├── hooks/              # Custom React hooks (useExamTimer, useSocketEvent)
├── lib/                # Core utilities & integrations
│   ├── api.ts          # Axios instance with JWT interceptors
│   ├── socket.ts       # Socket.io client & event handling
│   ├── storage.ts      # Hybrid SQLite (native) + localStorage (web) wrapper
│   ├── anti-cheat-config.ts  # Anti-cheat event listeners & monitoring
│   ├── errors.ts       # Client error types
│   ├── logger.ts       # Client logger
│   └── utils.ts        # Helper utilities
├── routes/             # React Router config (HashRouter with protected routes)
├── stores/             # Zustand global state (auth, exam, connectivity, socket, anti-cheat)
├── types/              # Re-exports @azhura/shared (keeps `@/types` imports working)
├── App.tsx             # Root layout with Toaster (Sonner)
└── main.tsx            # Bootstrap
```

### Shared Types (`packages/shared`)

Domain models (`User`, `Question`, `QuestionOption`, `ExamAnswer`, `ExamSession`, `AvailableExam`, `ExamResult`, anti-cheat types, …) live in `packages/shared/src/types/index.ts` and are exported from `@azhura/shared`. `apps/student/src/types/index.ts` re-exports them, so existing `@/types` imports still resolve. Both frontends and the backend's API contract should stay aligned with these.

### State Management (Zustand Stores — `apps/student/src/stores`)

- **`auth.ts`**: Authentication state (token, user, login/logout, token validation)
- **`exam.ts`**: Exam session & answer state (questions, current index, answers, flags, timer, results)
- **`connectivity.ts`**: Network status & background sync queue for offline resilience
- **`socket.ts`**: WebSocket connection state & real-time supervisor events (alerts, force submit, kick)
- **`anti-cheat.ts`**: Anti-cheat violation tracking (focus loss, fullscreen exit, shortcut attempts)

### Key Design Patterns

1. **Offline-First Storage**: Answers persist to SQLite (native) or localStorage (web) before syncing to the server. The `connectivity` store manages background syncing on reconnect.
2. **Hybrid Storage Abstraction** (`storage.ts`): Detects Tauri context, uses SQLite if available, else falls back to localStorage — seamless web/desktop compatibility.
3. **Real Backend (Elysia)**: The client talks to the `backend` API over HTTP (`lib/api.ts`) and Socket.io (`lib/socket.ts`). _(Run `bun run backend:dev` for data.)_
4. **Protected Routes**: `routes/index.tsx` defines a `<ProtectedRoute>` wrapper redirecting unauthenticated users to `/login`.
5. **Real-time Events via Socket.io**: The `socket` store subscribes to supervisor events (`alert-message`, `force-submit`, `kick`) from `backend/src/socket.ts`.
6. **Anti-Cheat Engine**: Configurable via `.env`. Monitors keyboard shortcuts (F12, Ctrl+R, Ctrl+Shift+R, …), fullscreen state, focus loss (Alt+Tab), and optionally multi-monitor; violations broadcast to supervisors and persist to `cheat_logs`. OS-level lockdown (kiosk window `lib/kiosk.ts` #26, low-level keyboard hook `lib/kbd-lock.ts` #27) is implemented; code signing (#28) is pending.

## Routing & Pages (student)

| Route | Component | Protected | Purpose |
|-------|-----------|-----------|---------|
| `/login` | `LoginForm` + `AuthLayout` | ❌ | Student login (NIS + password) |
| `/dashboard` | `DashboardPage` | ✅ | Shows exam options & start button |
| `/exam` | `ExamLayout` | ✅ | Main exam interface (questions, timer, sidebar) |
| `/result` | `ResultPage` | ✅ | Final score & breakdown after submission |

## Configuration (Environment Variables)

Each frontend and the backend has its **own** env. For the student client, copy `apps/student/.env.example` → `apps/student/.env.local`. The backend has `backend/.env.local`.

Student (`apps/student`) key variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_BASE_URL` | `http://localhost:3000/api` | HTTP API endpoint; Socket.io URL is derived from its origin (`/ws`) |
| `VITE_ANTI_CHEAT_ENABLED` | `false` | Activate anti-cheat engine |
| `VITE_ANTI_CHEAT_FULLSCREEN` | `false` | Enforce fullscreen mode |
| `VITE_ANTI_CHEAT_BLOCK_SHORTCUTS` | `false` | Block keyboard shortcuts (F12, refresh, etc.) |
| `VITE_ANTI_CHEAT_DETECT_FOCUS_LOSS` | `false` | Detect & log Alt+Tab / window blur |
| `VITE_ANTI_CHEAT_DETECT_MULTI_MONITOR` | `false` | Warn if multiple monitors detected |

## Development Credentials (backend seed)

Run `bun run backend:dev` and seed the DB (`cd backend && bun run seed`). Seeded students:

- **NIS**: `12345` | **Password**: `student@123` (Ahmad Faisal — Kelas 7A)
- **NIS**: `67890` | **Password**: `student@123` (Budi Santoso — Kelas 7B)
- **NIS**: `99999` | **Password**: `student@123` (Citra Lestari — Kelas 8A)

Students only see/start exams allowed for their group (`exam_groups`); the group is carried on the JWT.

## API Contract

See `API_CONTRACT.md` for full HTTP request/response specs:

- `POST /auth/login` — Student authentication
- `GET /auth/validate` — Token validation
- `GET /exams` — List exams the caller may take (group-scoped for students)
- `GET /exams/:examId/questions` — Fetch questions list
- `POST /exams/:examId/sessions` — Create a timed session (group-validated)
- `POST /exams/:examId/answer` — Submit individual answer (idempotent upsert)
- `POST /exams/:examId/answers/batch` — Flush a batch of queued answers (offline-first sync; idempotent upsert per question)
- `POST /exams/:examId/submit` — Final submission & scoring

WebSocket events (Socket.io): `alert-message`, `force-submit`, `kick`.

## Common Development Tasks

### Add a Shared Type

1. Add/extend the interface in `packages/shared/src/types/index.ts`.
2. It's exported via `@azhura/shared` automatically; consume it in either frontend.

### Add a New Store (Zustand) — student

1. Create `apps/student/src/stores/my-feature.ts`
2. Define the state interface, then `create<MyState>((set, get) => ({ ... }))`
3. Use in components: `const state = useMyFeatureStore()`

### Add a New API Endpoint

1. Add the route in `backend/src/routes/` (or a new route file), wire it in `backend/src/index.ts`.
2. Add/adjust request/response types in `packages/shared/src/types/index.ts`.
3. Call it via the axios instance (`apps/student/src/lib/api.ts`) from the client.

### Test Offline Storage (student)

1. Run the backend + student client; login and start an exam, select some answers.
2. DevTools → Network → throttle to "Offline"; select more answers (they persist to localStorage).
3. Refresh — answers restore from localStorage.
4. Go back online — the background sync queue attempts upload.

### Test Anti-Cheat Features (student)

1. In `apps/student/.env.local`, set `VITE_ANTI_CHEAT_ENABLED=true` (+ `_FULLSCREEN`, `_DETECT_FOCUS_LOSS`, `_BLOCK_SHORTCUTS` as needed).
2. Start an exam, try Alt+Tab / F12 — violations are logged to the `anti-cheat` store.

## TypeScript Path Aliases

Each app has its own `tsconfig.json` with `@/* → ./src/*`. Cross-package code is imported via the workspace package name, e.g. `import type { AvailableExam } from "@azhura/shared"`.

## Styling (student & console)

- **Framework**: Tailwind CSS v4 via `@tailwindcss/vite`
- **Components**: shadcn/ui (student: `apps/student/components.json`)
- **CSS Variables**: design tokens in `apps/student/src/index.css`
- **Fonts**: Geist Variable from `@fontsource-variable/geist`

## Notable Dependencies

| Package | Purpose |
|---------|---------|
| `@tauri-apps/api` | Tauri JS bindings (student) |
| `@tauri-apps/plugin-sql` | SQLite access in native mode (student) |
| `@tauri-apps/plugin-stronghold` | Encrypted credential storage (student) |
| `axios` | HTTP client with JWT interceptors |
| `socket.io-client` / `socket.io` | WebSocket realtime (client / backend) |
| `zustand` | Lightweight state management |
| `react-hook-form` + `zod` | Form validation & submission |
| `drizzle-orm` + `mysql2` | Backend ORM + MySQL driver |
| `elysia` + `@elysiajs/jwt` | Backend framework + JWT auth |
| `sonner` | Toast notifications |
| `shadcn/ui` + `radix-ui` | Accessible UI components |
| `lucide-react` | Icon library |
| `date-fns` | Date utilities |

## Important Caveats & TODOs

1. **Stronghold Integration** (`lib/secure-store.ts`, #129): Implemented. On Tauri the JWT + identity are stored encrypted-at-rest in Stronghold (never localStorage); web falls back to plaintext localStorage. `auth.ts` migrates a pre-Stronghold native token out of localStorage on first run.
2. **Connectivity Queue** (`connectivity.ts`): Wired (#10). `submitAnswer()` saves locally immediately and debounces a per-answer push to the server; failures/offline enqueue in `pendingAnswers`. The queue flushes as one idempotent **batch** (`POST /exams/:examId/answers/batch`) on three triggers — browser `online`, socket reconnect (`lib/socket.ts`), and an exponential-backoff retry. Terminal failures (400/401/403/404 dead session/token, 409 submitted, 410 expired) drop the queue instead of retrying. Final submit reconciles the in-memory superset and clears the queue.
3. **Anti-Cheat Logging** (#126): Implemented. Violations are logged to the `anti-cheat` store, pushed to supervisors live over Socket.io, and persisted to `cheat_logs` (keyed to the student's exam session). Configurable via `.env`.
4. **Console is a real app**: `apps/console` is the working admin + supervisor web app (question authoring, imports, recaps, live proctoring, settings). Further features continue under epic #6 + Fase 4.
5. **OS-level lockdown** (epic #24): kiosk window (`lib/kiosk.ts`, #26) and the low-level keyboard hook (`lib/kbd-lock.ts`, #27) are implemented. **Code signing (#28) remains open.**

## Debugging Tips

- **Store State**: React DevTools + Zustand plugin to inspect snapshots / time-travel.
- **Offline Simulation**: DevTools Network → Throttling → "Offline".
- **Socket Events**: Check the browser console for socket connection logs.
- **Tauri Context**: In `anti-cheat-config.ts`, Tauri is detected via the `__TAURI_INTERNALS__` check.

## Build & Deployment

### Student — Web

```bash
bun run build                # → apps/student/dist (serve statically)
```

### Student — Tauri Desktop

```bash
bun run tauri:build          # → apps/student/src-tauri/target/release/bundle/ (installers per OS)
```

### Console — Web

```bash
bun run console:build        # → apps/console/dist (serve statically)
```

## Additional Documentation

- `README.md` — Feature overview & setup guide
- `API_CONTRACT.md` — HTTP & WebSocket API specification
- `AGENT_PROMPT_CBT_SCAFFOLDING.md` — AI agent prompting guidelines for this codebase
