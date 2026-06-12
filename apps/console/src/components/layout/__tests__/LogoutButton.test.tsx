// @vitest-environment happy-dom
/**
 * LogoutButton (#181) — the header "Keluar" action must be confirm-gated:
 * clicking it opens a dialog, and `onLogout` only ever fires after the
 * operator explicitly confirms. "Batal" and Escape close without logging out.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LogoutButton } from "../LogoutButton";

// Vitest globals are off in this repo, so @testing-library's auto-cleanup
// never registers itself — unmount between tests manually.
afterEach(cleanup);

/** Renders the button and returns the spy plus the header trigger. */
function setup() {
  const onLogout = vi.fn();
  render(<LogoutButton onLogout={onLogout} />);
  const trigger = screen.getByRole("button", { name: "Keluar" });
  return { onLogout, trigger };
}

describe("LogoutButton", () => {
  it("renders without the confirmation dialog until clicked", () => {
    setup();

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the confirmation dialog on click — without logging out yet", () => {
    const { onLogout, trigger } = setup();

    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Yakin ingin keluar?" });
    expect(dialog).toBeTruthy();
    expect(onLogout).not.toHaveBeenCalled();
  });

  it("closes via 'Batal' without calling onLogout", async () => {
    const { onLogout, trigger } = setup();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Yakin ingin keluar?" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Batal" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onLogout).not.toHaveBeenCalled();
  });

  it("closes via Escape without calling onLogout", async () => {
    const { onLogout, trigger } = setup();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Yakin ingin keluar?" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onLogout).not.toHaveBeenCalled();
  });

  it("calls onLogout exactly once after confirming, then closes", async () => {
    const { onLogout, trigger } = setup();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Yakin ingin keluar?" });

    // Inside the dialog, "Keluar" is the confirm action (the header trigger
    // shares the label, hence the `within` scope).
    fireEvent.click(within(dialog).getByRole("button", { name: "Keluar" }));

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
