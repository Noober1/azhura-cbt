import { create } from "zustand";
import type { SchoolInfo, AntiCheatConfig } from "@azhura/shared";
import { appStoreGet, appStoreSet } from "../lib/app-store";
import { hashPassphrase } from "../lib/crypto";
import { buildExamCsp, applyCspMeta } from "../lib/csp";

const DEFAULT_PASSPHRASE = "azhura";

/** True when running inside the Tauri webview (vs a plain browser). */
const isTauriRuntime = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const DEFAULT_ANTI_CHEAT: AntiCheatConfig = {
  enabled: import.meta.env.VITE_ANTI_CHEAT_ENABLED === "true",
  fullscreen: import.meta.env.VITE_ANTI_CHEAT_FULLSCREEN === "true",
  blockShortcuts: import.meta.env.VITE_ANTI_CHEAT_BLOCK_SHORTCUTS === "true",
  detectFocusLoss: import.meta.env.VITE_ANTI_CHEAT_DETECT_FOCUS_LOSS === "true",
  detectMultiMonitor: import.meta.env.VITE_ANTI_CHEAT_DETECT_MULTI_MONITOR === "true",
  blockOsKeyboard: import.meta.env.VITE_ANTI_CHEAT_BLOCK_OS_KEYBOARD === "true",
};

interface ConfigState {
  /** URL of the backend server, e.g. "http://192.168.1.1:3000". Empty = not configured. */
  serverUrl: string;
  schoolInfo: SchoolInfo | null;
  antiCheat: AntiCheatConfig;
  debugMode: boolean;
  /** True once initialize() has completed (even if serverUrl is empty). */
  initialized: boolean;
  /** True when serverUrl has been set (wizard is complete). */
  isSetupComplete: boolean;

  /** Load persisted config from plugin-store. Called once at app start. */
  initialize: () => Promise<void>;
  setServerUrl: (url: string) => Promise<void>;
  setSchoolInfo: (info: SchoolInfo) => Promise<void>;
  setAntiCheat: (patch: Partial<AntiCheatConfig>) => Promise<void>;
  setDebugMode: (on: boolean) => Promise<void>;
  /** Verify the user-supplied passphrase against the stored hash. */
  verifyPassphrase: (input: string) => Promise<boolean>;
  /** Replace the stored passphrase hash. */
  changePassphrase: (newPassphrase: string) => Promise<void>;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  serverUrl: import.meta.env.VITE_API_BASE_URL
    ? new URL(import.meta.env.VITE_API_BASE_URL).origin
    : "",
  schoolInfo: null,
  antiCheat: { ...DEFAULT_ANTI_CHEAT },
  debugMode: false,
  initialized: false,
  isSetupComplete: false,

  initialize: async () => {
    const [serverUrl, schoolInfo, antiCheat, debugMode, passphraseHash] = await Promise.all([
      appStoreGet("serverUrl"),
      appStoreGet("schoolInfo"),
      appStoreGet("antiCheat"),
      appStoreGet("debugMode"),
      appStoreGet("passphraseHash"),
    ]);

    // Seed the default passphrase hash on first run.
    if (!passphraseHash) {
      await appStoreSet("passphraseHash", await hashPassphrase(DEFAULT_PASSPHRASE));
    }

    // In Tauri, the server URL comes ONLY from the persisted store — when it's
    // absent the first-run wizard (#43) must show, so we do NOT fall back to
    // `VITE_API_BASE_URL` (which would skip the wizard). The web build has no
    // wizard and keeps using the env-derived default.
    const resolvedUrl = serverUrl ?? (isTauriRuntime() ? "" : get().serverUrl);

    set({
      serverUrl: resolvedUrl,
      schoolInfo: schoolInfo ?? null,
      // Spread order matters: defaults first, so configs persisted by older
      // versions gain newly-added flags (e.g. blockOsKeyboard) at their default.
      antiCheat: antiCheat ? { ...DEFAULT_ANTI_CHEAT, ...antiCheat } : DEFAULT_ANTI_CHEAT,
      debugMode: debugMode ?? false,
      initialized: true,
      isSetupComplete: Boolean(resolvedUrl),
    });

    // Apply the runtime CSP now that the backend origin is known. This narrows
    // img/media/connect to the resolved origin as defense-in-depth (#191).
    applyCspMeta(buildExamCsp(resolvedUrl));
  },

  setServerUrl: async (url) => {
    await appStoreSet("serverUrl", url);
    set({ serverUrl: url, isSetupComplete: Boolean(url) });
    // Keep the CSP in sync when the configured origin changes (#191).
    applyCspMeta(buildExamCsp(url));
  },

  setSchoolInfo: async (info) => {
    await appStoreSet("schoolInfo", info);
    set({ schoolInfo: info });
  },

  setAntiCheat: async (patch) => {
    const next = { ...get().antiCheat, ...patch };
    await appStoreSet("antiCheat", next);
    set({ antiCheat: next });
  },

  setDebugMode: async (on) => {
    await appStoreSet("debugMode", on);
    set({ debugMode: on });
  },

  verifyPassphrase: async (input) => {
    const stored = await appStoreGet("passphraseHash");
    if (!stored) {
      // No hash yet — accept default passphrase only
      return input === DEFAULT_PASSPHRASE;
    }
    const { verifyPassphrase: verify } = await import("../lib/crypto");
    return verify(input, stored);
  },

  changePassphrase: async (newPassphrase) => {
    const hash = await hashPassphrase(newPassphrase);
    await appStoreSet("passphraseHash", hash);
  },
}));
