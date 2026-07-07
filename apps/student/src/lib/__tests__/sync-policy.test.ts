import { describe, it, expect } from "vitest";
import { classifyFlushFailure } from "../sync-policy";

describe("classifyFlushFailure", () => {
  it("drops the queue when the session is already submitted (409)", () => {
    expect(classifyFlushFailure(409)).toBe("drop");
  });

  it("drops the queue when the exam time has expired (410)", () => {
    expect(classifyFlushFailure(410)).toBe("drop");
  });

  it("retries on offline / no response (undefined status)", () => {
    expect(classifyFlushFailure(undefined)).toBe("retry");
  });

  it("retries on server errors", () => {
    expect(classifyFlushFailure(500)).toBe("retry");
    expect(classifyFlushFailure(503)).toBe("retry");
  });

  it("drops the queue on terminal client errors (bad payload, dead session/token)", () => {
    expect(classifyFlushFailure(400)).toBe("drop");
    expect(classifyFlushFailure(401)).toBe("drop");
    expect(classifyFlushFailure(403)).toBe("drop");
    expect(classifyFlushFailure(404)).toBe("drop");
  });

  it("retries on transient client errors like rate limiting (429)", () => {
    expect(classifyFlushFailure(429)).toBe("retry");
  });
});
