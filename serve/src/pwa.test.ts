/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { registerServiceWorker, SERVE_SCOPE, SERVE_SW_URL } from "./pwa";

describe("registerServiceWorker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers at /ury/serve/sw.js with scope /ury/serve/", async () => {
    const register = vi.fn().mockResolvedValue({ scope: SERVE_SCOPE });
    vi.stubGlobal("navigator", { serviceWorker: { register } });

    const result = await registerServiceWorker();

    expect(register).toHaveBeenCalledWith(SERVE_SW_URL, {
      scope: SERVE_SCOPE,
      updateViaCache: "none",
    });
    expect(result).toEqual({ scope: SERVE_SCOPE });
  });

  it("returns undefined when serviceWorker is unavailable", async () => {
    vi.stubGlobal("navigator", {});

    await expect(registerServiceWorker()).resolves.toBeUndefined();
  });

  it("returns undefined when registration throws", async () => {
    const register = vi.fn().mockRejectedValue(new Error("denied"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("navigator", { serviceWorker: { register } });

    await expect(registerServiceWorker()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});
