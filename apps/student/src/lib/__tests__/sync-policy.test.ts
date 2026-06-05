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

  it("retries on other client errors that are not terminal for the session", () => {
    expect(classifyFlushFailure(404)).toBe("retry");
    expect(classifyFlushFailure(429)).toBe("retry");
  });
});
