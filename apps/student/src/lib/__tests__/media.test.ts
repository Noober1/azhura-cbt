/**
 * resolveMediaUrl (#163) — resolves backend `/uploads/...` media paths against
 * the configured server origin (config store), passing absolute URLs through.
 */

import { afterEach, describe, expect, it } from "vitest";
import { resolveMediaUrl } from "../media";
import { useConfigStore } from "../../stores/config";

const initialServerUrl = useConfigStore.getState().serverUrl;

afterEach(() => {
  useConfigStore.setState({ serverUrl: initialServerUrl });
});

describe("resolveMediaUrl", () => {
  it("prefixes a relative uploads path with the configured server origin", () => {
    useConfigStore.setState({ serverUrl: "http://10.0.0.5:3000" });
    expect(resolveMediaUrl("/uploads/images/a.jpg")).toBe(
      "http://10.0.0.5:3000/uploads/images/a.jpg"
    );
  });

  it("tolerates a trailing slash on the configured origin", () => {
    useConfigStore.setState({ serverUrl: "http://10.0.0.5:3000/" });
    expect(resolveMediaUrl("/uploads/images/a.jpg")).toBe(
      "http://10.0.0.5:3000/uploads/images/a.jpg"
    );
  });

  it("returns the path unchanged when no server origin is configured (same-origin)", () => {
    useConfigStore.setState({ serverUrl: "" });
    expect(resolveMediaUrl("/uploads/images/a.jpg")).toBe("/uploads/images/a.jpg");
  });

  it("passes absolute http(s) URLs through untouched", () => {
    useConfigStore.setState({ serverUrl: "http://10.0.0.5:3000" });
    expect(resolveMediaUrl("https://cdn.example.com/x.png")).toBe(
      "https://cdn.example.com/x.png"
    );
  });
});
