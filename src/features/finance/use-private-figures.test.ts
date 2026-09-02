import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePrivateFigures } from "./use-private-figures";

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("usePrivateFigures", () => {
  it("starts visible", () => {
    const { result } = renderHook(() => usePrivateFigures());
    expect(result.current.hidden).toBe(false);
  });

  it("toggles and remembers for the session", () => {
    const { result } = renderHook(() => usePrivateFigures());

    act(() => result.current.toggle());
    expect(result.current.hidden).toBe(true);
    expect(sessionStorage.getItem("finance_figures_hidden")).toBe("true");

    act(() => result.current.toggle());
    expect(result.current.hidden).toBe(false);
  });

  it("restores a hidden session", () => {
    sessionStorage.setItem("finance_figures_hidden", "true");
    const { result } = renderHook(() => usePrivateFigures());
    expect(result.current.hidden).toBe(true);
  });

  /**
   * A private window, or a browser set to block site data, throws on access
   * rather than returning null. Visible is the right default when the
   * preference cannot be read, and being unable to *remember* the choice is
   * not a reason to refuse to apply it for this view.
   */
  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const { result } = renderHook(() => usePrivateFigures());
    expect(result.current.hidden).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.hidden).toBe(true);
  });
});
