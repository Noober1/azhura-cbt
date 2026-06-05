import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createKeyedDebouncer } from "../debounce";

describe("createKeyedDebouncer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("invokes the trailing call once after the delay", () => {
    const debouncer = createKeyedDebouncer<string>(600);
    const fn = vi.fn();

    debouncer.schedule("q1", fn);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("coalesces rapid calls for the same key into one invocation", () => {
    const debouncer = createKeyedDebouncer<string>(600);
    const first = vi.fn();
    const second = vi.fn();
    const third = vi.fn();

    debouncer.schedule("q1", first);
    vi.advanceTimersByTime(300);
    debouncer.schedule("q1", second);
    vi.advanceTimersByTime(300);
    debouncer.schedule("q1", third);
    vi.advanceTimersByTime(600);

    // Only the latest scheduled fn runs, exactly once.
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    expect(third).toHaveBeenCalledTimes(1);
  });

  it("debounces keys independently", () => {
    const debouncer = createKeyedDebouncer<string>(600);
    const a = vi.fn();
    const b = vi.fn();

    debouncer.schedule("qA", a);
    vi.advanceTimersByTime(300);
    debouncer.schedule("qB", b); // must not delay qA
    vi.advanceTimersByTime(300);

    expect(a).toHaveBeenCalledTimes(1); // qA fired at 600
    expect(b).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(b).toHaveBeenCalledTimes(1); // qB fired at 600 from its own schedule
  });

  it("cancel() prevents a pending call", () => {
    const debouncer = createKeyedDebouncer<string>(600);
    const fn = vi.fn();

    debouncer.schedule("q1", fn);
    debouncer.cancel("q1");
    vi.advanceTimersByTime(600);

    expect(fn).not.toHaveBeenCalled();
    expect(debouncer.pendingCount()).toBe(0);
  });

  it("cancelAll() clears every pending call and resets the count", () => {
    const debouncer = createKeyedDebouncer<string>(600);
    debouncer.schedule("q1", vi.fn());
    debouncer.schedule("q2", vi.fn());
    expect(debouncer.pendingCount()).toBe(2);

    debouncer.cancelAll();
    expect(debouncer.pendingCount()).toBe(0);
  });

  it("clears the key from the pending set after firing", () => {
    const debouncer = createKeyedDebouncer<string>(600);
    debouncer.schedule("q1", vi.fn());
    expect(debouncer.pendingCount()).toBe(1);

    vi.advanceTimersByTime(600);
    expect(debouncer.pendingCount()).toBe(0);
  });
});
