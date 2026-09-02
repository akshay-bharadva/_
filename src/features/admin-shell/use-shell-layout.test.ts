import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  SHELL_LAYOUT_KEY,
  SHELL_LAYOUTS,
  useShellLayout,
} from "./use-shell-layout";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useShellLayout", () => {
  /**
   * The launcher, because it works at every width — the rail assumes there is
   * room for it, and a first-run laptop is the case where that assumption is
   * most likely wrong.
   */
  it("defaults to the launcher", () => {
    const { result } = renderHook(() => useShellLayout());
    expect(result.current.layout).toBe("launcher");
  });

  it("restores a stored choice", () => {
    localStorage.setItem(SHELL_LAYOUT_KEY, "sidebar");
    const { result } = renderHook(() => useShellLayout());
    expect(result.current.layout).toBe("sidebar");
    expect(result.current.ready).toBe(true);
  });

  it("remembers a change", () => {
    const { result } = renderHook(() => useShellLayout());
    act(() => result.current.choose("sidebar"));

    expect(result.current.layout).toBe("sidebar");
    expect(localStorage.getItem(SHELL_LAYOUT_KEY)).toBe("sidebar");
  });

  it("switches back", () => {
    localStorage.setItem(SHELL_LAYOUT_KEY, "sidebar");
    const { result } = renderHook(() => useShellLayout());
    act(() => result.current.choose("launcher"));
    expect(localStorage.getItem(SHELL_LAYOUT_KEY)).toBe("launcher");
  });

  /**
   * A private window or a browser blocking site data throws on access rather
   * than returning null. Not being able to *remember* the choice is no reason
   * to refuse to apply it for this session.
   */
  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const { result } = renderHook(() => useShellLayout());
    expect(result.current.layout).toBe("launcher");

    act(() => result.current.choose("sidebar"));
    expect(result.current.layout).toBe("sidebar");
  });

  /**
   * Anything unrecognised is the launcher, not a crash and not a blank shell —
   * a stored value can outlive the option it named.
   */
  it("treats an unknown stored value as the default", () => {
    localStorage.setItem(SHELL_LAYOUT_KEY, "carousel");
    const { result } = renderHook(() => useShellLayout());
    expect(result.current.layout).toBe("launcher");
  });

  it("offers both arrangements, each explained", () => {
    expect(SHELL_LAYOUTS.map((option) => option.id)).toEqual([
      "launcher",
      "sidebar",
    ]);
    expect(SHELL_LAYOUTS.every((option) => option.hint.length > 0)).toBe(true);
  });
});
