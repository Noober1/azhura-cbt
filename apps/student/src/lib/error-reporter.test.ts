import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the axios instance so no real network call happens. The reporter imports
// the default export `api` and calls `api.post(...)`.
const post = vi.fn();
vi.mock("./api", () => ({
  default: { post: (...args: unknown[]) => post(...args) },
}));

import {
  reportError,
  reportBug,
  installGlobalErrorHandlers,
  __resetLastError,
  __resetPendingSignatures,
} from "./error-reporter";

describe("error-reporter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    post.mockReset();
    post.mockResolvedValue({ data: { accepted: true } });
    __resetLastError();
    __resetPendingSignatures();
    // The student vitest harness runs in a Node env (no jsdom), so stub the
    // minimal `window` surface the reporter reads (route from location.hash).
    vi.stubGlobal("window", { location: { hash: "#/exam" } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("reportError (auto, debounced + deduped)", () => {
    it("does not POST until the dedup window elapses", () => {
      reportError({ message: "Boom" });
      expect(post).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5000);
      expect(post).toHaveBeenCalledTimes(1);
    });

    it("collapses identical errors within the window into one POST", () => {
      reportError({ message: "Boom", component: "ErrorBoundary" });
      vi.advanceTimersByTime(2000);
      reportError({ message: "Boom", component: "ErrorBoundary" });
      vi.advanceTimersByTime(2000);
      reportError({ message: "Boom", component: "ErrorBoundary" });
      vi.advanceTimersByTime(5000);

      expect(post).toHaveBeenCalledTimes(1);
    });

    it("ships distinct signatures separately", () => {
      reportError({ message: "Boom A" });
      reportError({ message: "Boom B" });
      vi.advanceTimersByTime(5000);

      expect(post).toHaveBeenCalledTimes(2);
    });

    it("builds an auto payload with kind/route/version/timestamp", () => {
      const before = Date.now();
      reportError({ message: "Crash", component: "ErrorBoundary" });
      vi.advanceTimersByTime(5000);

      const [url, body] = post.mock.calls[0];
      expect(url).toBe("/error-reports");
      expect(body.kind).toBe("auto");
      expect(body.message).toBe("Crash");
      expect(body.component).toBe("ErrorBoundary");
      expect(body.route).toBe("/exam");
      expect(typeof body.appVersion).toBe("string");
      expect(body.timestamp).toBeGreaterThanOrEqual(before);
      // Server pins identity from JWT — never send actor fields.
      expect(body).not.toHaveProperty("userId");
      expect(body).not.toHaveProperty("role");
    });

    it("derives the message from an Error and captures its stack", () => {
      const err = new Error("kaput");
      reportError({ error: err, component: "ErrorBoundary" });
      vi.advanceTimersByTime(5000);

      const body = post.mock.calls[0][1];
      expect(body.message).toBe("kaput");
      expect(typeof body.stack).toBe("string");
    });

    it("never throws when the POST rejects", async () => {
      post.mockRejectedValue(new Error("network down"));
      expect(() => {
        reportError({ message: "Boom" });
        vi.advanceTimersByTime(5000);
      }).not.toThrow();
      await vi.runAllTimersAsync();
    });
  });

  describe("reportBug (manual)", () => {
    it("uses the first line as message and full text as description", async () => {
      const promise = reportBug("App froze on submit\nRepro: click submit twice");
      await vi.runAllTimersAsync();
      await promise;

      const body = post.mock.calls[0][1];
      expect(body.kind).toBe("manual");
      expect(body.message).toBe("App froze on submit");
      expect(body.description).toContain("Repro: click submit twice");
    });

    it("returns true when the server accepts", async () => {
      const promise = reportBug("something broke");
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBe(true);
    });

    it("returns false when the server rejects acceptance", async () => {
      post.mockResolvedValue({ data: { accepted: false } });
      const promise = reportBug("something broke");
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBe(false);
    });

    it("attaches the last auto-error when includeLastError is set", async () => {
      reportError({ error: new Error("earlier crash"), component: "ErrorBoundary" });
      const promise = reportBug("here is what happened", { includeLastError: true });
      await vi.runAllTimersAsync();
      await promise;

      const manualCall = post.mock.calls.find((c) => c[1].kind === "manual");
      expect(manualCall).toBeDefined();
      const body = manualCall![1];
      expect(body.component).toBe("ErrorBoundary");
      expect(typeof body.stack).toBe("string");
    });

    it("does not attach last-error context by default", async () => {
      reportError({ error: new Error("earlier crash"), component: "ErrorBoundary" });
      const promise = reportBug("plain report");
      await vi.runAllTimersAsync();
      await promise;

      const manualCall = post.mock.calls.find((c) => c[1].kind === "manual");
      expect(manualCall![1].stack).toBeUndefined();
    });
  });

  describe("installGlobalErrorHandlers", () => {
    type Listener = (event: unknown) => void;

    /** A window stub that records event listeners so the test can dispatch. */
    function stubListenerWindow() {
      const listeners: Record<string, Listener[]> = {};
      const win = {
        location: { hash: "#/exam" },
        addEventListener: (type: string, fn: Listener) => {
          (listeners[type] ??= []).push(fn);
        },
        removeEventListener: (type: string, fn: Listener) => {
          listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
        },
      };
      vi.stubGlobal("window", win);
      return listeners;
    }

    it("routes window 'error' events into a debounced report", () => {
      const listeners = stubListenerWindow();
      installGlobalErrorHandlers();

      listeners.error[0]({ error: new Error("global boom"), message: "global boom" });
      expect(post).not.toHaveBeenCalled();
      vi.advanceTimersByTime(5000);

      expect(post).toHaveBeenCalledTimes(1);
      expect(post.mock.calls[0][1].message).toBe("global boom");
    });

    it("routes 'unhandledrejection' events into a report", () => {
      const listeners = stubListenerWindow();
      installGlobalErrorHandlers();

      listeners.unhandledrejection[0]({ reason: new Error("rejected") });
      vi.advanceTimersByTime(5000);

      expect(post).toHaveBeenCalledTimes(1);
      expect(post.mock.calls[0][1].message).toBe("rejected");
    });

    it("is idempotent — a second install adds no duplicate listeners", () => {
      const listeners = stubListenerWindow();
      installGlobalErrorHandlers();
      installGlobalErrorHandlers();

      expect(listeners.error).toHaveLength(1);
      expect(listeners.unhandledrejection).toHaveLength(1);
    });

    it("cleanup removes listeners and allows a fresh re-install", () => {
      const listeners = stubListenerWindow();
      const cleanup = installGlobalErrorHandlers();
      cleanup();

      expect(listeners.error).toHaveLength(0);
      expect(listeners.unhandledrejection).toHaveLength(0);

      installGlobalErrorHandlers();
      expect(listeners.error).toHaveLength(1);
    });
  });
});
