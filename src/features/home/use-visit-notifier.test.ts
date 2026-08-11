import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVisitNotifier } from "./use-visit-notifier";

const NOTIFIER_URL = "https://discord.test/webhook";

const fetchMock = vi.fn();

/** The hook only fires in a production build with a configured webhook. */
const enableNotifier = () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_VISIT_NOTIFIER_URL", NOTIFIER_URL);
};

describe("useVisitNotifier", () => {
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("posts a visit embed on the first production visit", () => {
    enableNotifier();

    renderHook(() => useVisitNotifier());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(NOTIFIER_URL);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.embeds[0].title).toBe("Portfolio visit");
    expect(body.embeds[0].fields.map((f: { name: string }) => f.name)).toEqual([
      "Referrer",
      "User agent",
    ]);
  });

  it("records direct visits when there is no referrer", () => {
    enableNotifier();

    renderHook(() => useVisitNotifier());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.embeds[0].fields[0].value).toBe("direct");
  });

  it("truncates a long user agent", () => {
    enableNotifier();
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("x".repeat(1000));

    renderHook(() => useVisitNotifier());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.embeds[0].fields[1].value).toHaveLength(512);
  });

  it("pings only once per session", () => {
    enableNotifier();

    renderHook(() => useVisitNotifier());
    renderHook(() => useVisitNotifier());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("visitNotified")).toBe("1");
  });

  it("stays silent outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_VISIT_NOTIFIER_URL", NOTIFIER_URL);

    renderHook(() => useVisitNotifier());

    expect(fetchMock).not.toHaveBeenCalled();
    // A dev visit must not burn the session flag a later prod visit relies on.
    expect(sessionStorage.getItem("visitNotified")).toBeNull();
  });

  it("stays silent without a configured webhook", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_VISIT_NOTIFIER_URL", "");

    renderHook(() => useVisitNotifier());

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swallows a failed ping", async () => {
    enableNotifier();
    fetchMock.mockRejectedValue(new Error("network down"));

    expect(() => renderHook(() => useVisitNotifier())).not.toThrow();
    // Telemetry is best-effort; an unhandled rejection here would surface in
    // the visitor's console.
    await expect(fetchMock.mock.results[0].value).rejects.toThrow(
      "network down",
    );
  });
});
