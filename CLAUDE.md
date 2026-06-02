# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Azhura CBT Exam Client** is a secure, offline-capable Computer-Based Test (CBT) application built with **Tauri 2.x** (desktop), **React 19**, **TypeScript**, and **Zustand** state management. It's designed for Indonesian schools and supports both desktop (via Tauri) and web deployments with high security features (anti-cheat engine, offline-first architecture, and encrypted credential storage).

## Development Commands

```bash
# Local web development (Vite dev server)
bun run dev

# Build production bundle
bun run build

# Preview production build locally
bun run preview

# Tauri desktop development (hot reload, native frame)
bun run tauri dev

# Build native installer (.exe / .msi / .dmg / .AppImage)
bun run tauri build
```

## Architecture Overview

### High-Level Structure

```
src/
├── components/          # React UI components organized by feature
│   ├── auth/           # LoginForm
│   ├── exam/           # ExamLayout, QuestionRenderer, TimerDisplay, ExamSidebar, NavigationPanel, SubmitConfirmation, ResultPage
│   └── layout/         # AuthLayout, shared layout wrappers
├── hooks/              # Custom React hooks (useExamTimer, useSocketEvent)
├── lib/                # Core utilities & integrations
│   ├── api.ts          # Axios instance with JWT interceptors
│   ├── socket.ts       # Socket.io client & event handling
│   ├── socket.mock.ts  # Mock socket emitter for testing supervisor events
│   ├── storage.ts      # Hybrid SQLite (native) + localStorage (web) wrapper
│   ├── anti-cheat-config.ts  # Anti-cheat event listeners & monitoring
│   └── utils.ts        # Helper utilities
├── mocks/              # MSW (Mock Service Worker) setup for development
│   ├── browser.ts      # MSW worker initialization
│   ├── handlers/       # MSW http handlers (auth, exam endpoints)
│   └── data/           # Mock data (users, questions)
├── routes/             # React Router configuration (HashRouter with protected routes)
├── stores/             # Zustand global state (auth, exam, connectivity, socket, anti-cheat)
├── types/              # TypeScript type definitions (User, Question, ExamAnswer, etc.)
├── App.tsx             # Root layout with Toaster (Sonner)
└── main.tsx            # Bootstrap & MSW initialization
```

### State Management (Zustand Stores)

- **`auth.ts`**: Authentication state (token, user, login/logout, token validation)
- **`exam.ts`**: Exam session & answer state (questions, current question index, answers, flags, timer, results)
- **`connectivity.ts`**: Network status & background sync queue for offline resilience
- **`socket.ts`**: WebSocket connection state & real-time supervisor events (alerts, force submit, kick)
- **`anti-cheat.ts`**: Anti-cheat violation tracking (focus loss, fullscreen exit, shortcut attempts)

### Key Design Patterns

1. **Offline-First Storage**: Answers are automatically persisted to SQLite (native) or localStorage (web) before being synced to the server. The `connectivity` store manages background syncing when connection is restored.

2. **Hybrid Storage Abstraction** (`storage.ts`): Detects Tauri context and uses SQLite if available, otherwise falls back to localStorage. This enables seamless web/desktop compatibility.

3. **Mock Service Worker (MSW)**: In development mode (`VITE_USE_MOCK=true`), HTTP requests are intercepted by MSW handlers. This allows testing without a backend server. MSW is conditionally initialized in `main.tsx`.

4. **Protected Routes**: `routes/index.tsx` defines a `<ProtectedRoute>` wrapper that redirects unauthenticated users to `/login`.

5. **Real-time Events via Socket.io**: The `socket` store subscribes to supervisor events (`alert-message`, `force-submit`, `kick`) from the server.

6. **Anti-Cheat Engine**: Configurable via `.env` variables. Monitors keyboard shortcuts (F12, Ctrl+R, etc.), fullscreen state, focus loss (Alt+Tab), and optionally multi-monitor detection.

## Routing & Pages

| Route | Component | Protected | Purpose |
|-------|-----------|-----------|---------|
| `/login` | `LoginForm` + `AuthLayout` | ❌ | Student login (NIS + password) |
| `/dashboard` | `DashboardPage` | ✅ | Shows exam options & start button |
| `/exam` | `ExamLayout` | ✅ | Main exam interface (questions, timer, sidebar) |
| `/result` | `ResultPage` | ✅ | Final score & breakdown after submission |

## Configuration (Environment Variables)

Create a `.env.local` file from `.env.example`:

```bash
cp .env.example .env.local
```

Key variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_USE_MOCK` | `true` | Enable MSW mock handlers & mock socket events |
| `VITE_API_BASE_URL` | `http://localhost:3000/api` | HTTP API endpoint; Socket.io URL diturunkan otomatis dari origin-nya (`/ws`) |
| `VITE_ANTI_CHEAT_ENABLED` | `false` | Activate anti-cheat engine |
| `VITE_ANTI_CHEAT_FULLSCREEN` | `false` | Enforce fullscreen mode |
| `VITE_ANTI_CHEAT_BLOCK_SHORTCUTS` | `false` | Block keyboard shortcuts (F12, refresh, etc.) |
| `VITE_ANTI_CHEAT_DETECT_FOCUS_LOSS` | `false` | Detect & log Alt+Tab / window blur |
| `VITE_ANTI_CHEAT_DETECT_MULTI_MONITOR` | `false` | Warn if multiple monitors detected |

## Mock Development Credentials

When `VITE_USE_MOCK=true`, use these credentials to login:

- **NIS**: `12345` | **Password**: `student@123` (Ahmad Faisal)
- **NIS**: `67890` | **Password**: `student@123` (Budi Santoso)
- **NIS**: `99999` | **Password**: `student@123` (Citra Lestari)

## Testing Supervisor Events (Browser Console)

When logged into the exam page with mock mode enabled, open DevTools (F12) and use:

```javascript
// Send supervisor alert message
window.mockSocket.triggerAlert("Ujian tinggal 10 menit!");

// Force-kick student from exam
window.mockSocket.triggerKick("Melakukan pelanggaran berat.");

// Force student to submit immediately
window.mockSocket.triggerForceSubmit();
```

These trigger mock socket events emitted from the server side.

## API Contract

See `API_CONTRACT.md` for full HTTP request/response specifications:

- `POST /auth/login` — Student authentication
- `GET /auth/validate` — Token validation
- `GET /exams/:examId/questions` — Fetch questions list
- `POST /exams/:examId/answer` — Submit individual answer
- `POST /exams/:examId/submit` — Final exam submission & scoring

WebSocket events (Socket.io):
- `alert-message` — Supervisor alert to student
- `force-submit` — Force exam submission
- `kick` — Force student logout

## Common Development Tasks

### Add a New Store (Zustand)

1. Create `src/stores/my-feature.ts`
2. Define interface extending state shape
3. Use `create<MyState>((set, get) => ({ ... }))`
4. Import & use hook in components: `const state = useMyFeatureStore()`

**Note**: Zustand is preferred over Context/Redux for simplicity. No async middleware needed—handle side effects in effects or callbacks.

### Add a New API Endpoint

1. Add MSW handler to `src/mocks/handlers/exam.ts` (or create new handler file)
2. Export handler and import in `src/mocks/browser.ts`
3. Add request/response types to `src/types/index.ts`
4. Call via `api.post()` or `api.get()` from axios instance (`src/lib/api.ts`)

### Test Offline Storage

1. Set `VITE_USE_MOCK=true` in `.env.local`
2. Login and start exam, select some answers
3. Open DevTools Network tab and throttle to "Offline"
4. Select more answers; they should persist to localStorage
5. Refresh page; answers should restore from localStorage
6. Go back online (undo throttle); background sync queue should attempt upload

### Test Anti-Cheat Features

1. Set `VITE_ANTI_CHEAT_ENABLED=true` in `.env.local`
2. Set `VITE_ANTI_CHEAT_FULLSCREEN=true` to force fullscreen
3. Set `VITE_ANTI_CHEAT_DETECT_FOCUS_LOSS=true` to log Alt+Tab
4. Set `VITE_ANTI_CHEAT_BLOCK_SHORTCUTS=true` to prevent F12, Ctrl+R, etc.
5. Start exam and try Alt+Tab or F12—check console for violations logged to `anti-cheat` store

## TypeScript Path Aliases

Import paths are aliased via `tsconfig.json`:

```typescript
import { useExamStore } from "@/stores/exam"  // not ../../../stores/exam
```

## Styling

- **Framework**: Tailwind CSS v4 via `@tailwindcss/vite` plugin
- **Components**: shadcn/ui (headless, composable)
- **CSS Variables**: Design tokens defined in `src/index.css`
- **Fonts**: Geist Variable font from `@fontsource-variable/geist`

## Notable Dependencies

| Package | Purpose |
|---------|---------|
| `@tauri-apps/api` | Tauri JS bindings for OS integration |
| `@tauri-apps/plugin-sql` | SQLite database access in native mode |
| `@tauri-apps/plugin-stronghold` | Encrypted credential storage |
| `axios` | HTTP client with JWT interceptors |
| `socket.io-client` | WebSocket real-time communication |
| `zustand` | Lightweight state management |
| `react-hook-form` + `zod` | Form validation & submission |
| `msw` | Mock Service Worker for API mocking |
| `sonner` | Toast notifications |
| `shadcn/ui` + `radix-ui` | Accessible UI components |
| `lucide-react` | Icon library |
| `date-fns` | Date utilities |

## Important Caveats & TODOs

1. **Stronghold Integration** (auth.ts): Token encryption in Tauri is stubbed with `// TODO`. Production Tauri deployment should integrate `@tauri-apps/plugin-stronghold` to securely store JWT tokens.

2. **Real API Integration** (auth.ts, exam.ts): Many stores conditionally use mock scoring logic when `VITE_USE_MOCK=true`. In production, swap this for real API calls.

3. **Connectivity Queue** (connectivity.ts): Background sync is not fully wired up. `submitAnswer()` saves locally but does not push to server in real time; this is by design (offline-first). Background syncing should batch pending answers and retry on reconnection.

4. **Anti-Cheat Logging**: Violations are logged to the `anti-cheat` store but not uploaded to server. Production should periodically push violation logs to a supervisor dashboard endpoint.

5. **SessionStorage vs LocalStorage**: Currently using `localStorage` for persistence. Consider `sessionStorage` for session-scoped data if exams should be single-use per browser tab.

## Debugging Tips

- **MSW Interception**: If requests aren't being mocked, check that `VITE_USE_MOCK=true` and MSW worker has started (check Network tab in DevTools for `mockServiceWorker.js`).
- **Store State**: Use React DevTools extension + Zustand plugin to inspect store snapshots and time-travel debug.
- **Offline Simulation**: DevTools Network tab → Throttling → "Offline" to test connectivity queue behavior.
- **Socket Events**: Check browser console for socket connection logs and emitted events.
- **Tauri Context**: In `anti-cheat-config.ts`, detection of Tauri is done via `__TAURI_INTERNALS__` check; ensure this is available when running in native mode.

## Build & Deployment

### Web Deployment

```bash
bun run build
# Output: dist/ (serve statically)
```

### Tauri Desktop Build

```bash
bun run tauri build
# Output: src-tauri/target/release/bundle/ (installers per OS)
```

## Additional Documentation

- `README.md` — Feature overview & setup guide
- `API_CONTRACT.md` — HTTP & WebSocket API specification
- `AGENT_PROMPT_CBT_SCAFFOLDING.md` — AI agent prompting guidelines for this codebase
