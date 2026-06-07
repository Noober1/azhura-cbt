import { describe, it, expect, beforeEach } from "vitest";
import type { ChatMessage } from "@azhura/shared";
import { useChatStore } from "../chat";

const msg = (id: string, content = "hi"): ChatMessage => ({
  id,
  kind: "user",
  userId: "u1",
  name: "Budi",
  groupName: "7A",
  content,
  timestamp: Date.now(),
});

describe("useChatStore", () => {
  beforeEach(() => {
    useChatStore.setState({
      enabled: false,
      messages: [],
      presence: [],
      mutedUntil: null,
      muteReason: null,
      muteManual: false,
    });
  });

  it("setHistory replaces the message buffer", () => {
    useChatStore.getState().setHistory([msg("a"), msg("b")]);
    expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("pushMessage appends to the buffer", () => {
    useChatStore.getState().setHistory([msg("a")]);
    useChatStore.getState().pushMessage(msg("b"));
    expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("disabling chat clears messages and presence", () => {
    useChatStore.setState({
      enabled: true,
      messages: [msg("a")],
      presence: [{ userId: "u1", name: "Budi", groupName: "7A" }],
    });
    useChatStore.getState().setEnabled(false);
    const state = useChatStore.getState();
    expect(state.enabled).toBe(false);
    expect(state.messages).toEqual([]);
    expect(state.presence).toEqual([]);
  });

  it("enabling chat preserves existing messages", () => {
    useChatStore.setState({ enabled: false, messages: [msg("a")] });
    useChatStore.getState().setEnabled(true);
    expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(["a"]);
  });

  it("setMuted stores the mute and setMuted/clearMute round-trips", () => {
    useChatStore.getState().setMuted(123, "diam", true);
    expect(useChatStore.getState()).toMatchObject({
      mutedUntil: 123,
      muteReason: "diam",
      muteManual: true,
    });
    useChatStore.getState().clearMute();
    expect(useChatStore.getState()).toMatchObject({
      mutedUntil: null,
      muteReason: null,
      muteManual: false,
    });
  });
});
