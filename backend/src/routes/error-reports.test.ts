/**
 * Unit tests for the client error/bug ingest route helpers (#169).
 *
 * The route persists through `writeEventLog` (fire-and-forget) and is exercised
 * end-to-end by E2E; per project convention these route tests avoid the live DB
 * and instead pin down the pure `buildErrorLogEntry` mapping: eventType
 * selection by kind, actor override from the JWT, and field truncation.
 */

// Load the DB module first to defuse the latent db → logger → log-files →
// log-store → db import cycle: error-reports.ts transitively imports log-files,
// so loading `db` as the cycle entry avoids a `createLogger` TDZ error when this
// file shares a `bun test` run with others.
import "../db";

import { describe, it, expect } from "bun:test";
import { buildErrorLogEntry } from "./error-reports";

const USER = { userId: "user-123", role: "student" };

describe("buildErrorLogEntry", () => {
  it("maps a manual report to the bug_report event type", () => {
    const entry = buildErrorLogEntry(
      { kind: "manual", message: "Tombol submit tidak jalan", timestamp: 1700 },
      USER
    );
    expect(entry.eventType).toBe("bug_report");
    expect(entry.fields.kind).toBe("manual");
  });

  it("maps an auto report to the client_error event type", () => {
    const entry = buildErrorLogEntry(
      { kind: "auto", message: "TypeError: x is undefined", timestamp: 1700 },
      USER
    );
    expect(entry.eventType).toBe("client_error");
    expect(entry.fields.kind).toBe("auto");
  });

  it("pins actor identity to the JWT, ignoring any client-supplied identity", () => {
    const entry = buildErrorLogEntry(
      { kind: "auto", message: "boom", timestamp: 1 },
      { userId: "admin-9", role: "admin" }
    );
    expect(entry.actor).toStrictEqual({ id: "admin-9", role: "admin" });
  });

  it("carries optional context fields and the client timestamp", () => {
    const entry = buildErrorLogEntry(
      {
        kind: "auto",
        message: "render failed",
        stack: "Error: render failed\n  at App",
        route: "/exam",
        component: "QuestionRenderer",
        appVersion: "1.2.3",
        timestamp: 42,
      },
      USER
    );
    expect(entry.fields.stack).toBe("Error: render failed\n  at App");
    expect(entry.fields.route).toBe("/exam");
    expect(entry.fields.component).toBe("QuestionRenderer");
    expect(entry.fields.appVersion).toBe("1.2.3");
    expect(entry.fields.clientTimestamp).toBe(42);
  });

  it("truncates an over-long message to the 1000-char cap", () => {
    const longMessage = "a".repeat(1500);
    const entry = buildErrorLogEntry(
      { kind: "auto", message: longMessage, timestamp: 1 },
      USER
    );
    expect(entry.message).toHaveLength(1000);
  });

  it("truncates an over-long stack to the 4000-char cap", () => {
    const longStack = "s".repeat(5000);
    const entry = buildErrorLogEntry(
      { kind: "auto", message: "boom", stack: longStack, timestamp: 1 },
      USER
    );
    expect(entry.fields.stack).toHaveLength(4000);
  });

  it("leaves missing optional fields undefined", () => {
    const entry = buildErrorLogEntry(
      { kind: "manual", message: "hi", timestamp: 1 },
      USER
    );
    expect(entry.fields.stack).toBeUndefined();
    expect(entry.fields.route).toBeUndefined();
    expect(entry.fields.description).toBeUndefined();
  });
});
