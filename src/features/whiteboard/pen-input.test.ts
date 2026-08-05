import { describe, it, expect, vi } from "vitest";
import {
  STYLUS_ONLY_STORAGE_KEY,
  describeSaveState,
  isPenPointer,
  readStylusOnly,
  shouldAutosave,
  shouldBlockPointer,
  writeStylusOnly,
} from "./pen-input";

describe("shouldBlockPointer", () => {
  const base = { stylusOnly: true, activeTouches: 1 };

  /** The bug this exists to prevent: a palm lands before the nib and draws. */
  it("blocks a single finger while stylus-only is on", () => {
    expect(shouldBlockPointer({ ...base, pointerType: "touch" })).toBe(true);
  });

  it("never blocks the pen", () => {
    expect(shouldBlockPointer({ ...base, pointerType: "pen" })).toBe(false);
  });

  /** A mouse means there is no palm resting on the glass. */
  it("never blocks a mouse", () => {
    expect(shouldBlockPointer({ ...base, pointerType: "mouse" })).toBe(false);
  });

  /**
   * Blocking all touch would also block pan and pinch, which would make the
   * board unusable on exactly the device the mode is meant to help.
   */
  it("lets two fingers through, because that is a pan or a pinch", () => {
    expect(
      shouldBlockPointer({ ...base, pointerType: "touch", activeTouches: 2 }),
    ).toBe(false);
    expect(
      shouldBlockPointer({ ...base, pointerType: "touch", activeTouches: 3 }),
    ).toBe(false);
  });

  it("blocks nothing when the mode is off", () => {
    for (const pointerType of ["touch", "pen", "mouse"]) {
      expect(
        shouldBlockPointer({
          pointerType,
          stylusOnly: false,
          activeTouches: 1,
        }),
      ).toBe(false);
    }
  });

  it("treats a zero touch count as a single touch", () => {
    expect(
      shouldBlockPointer({ ...base, pointerType: "touch", activeTouches: 0 }),
    ).toBe(true);
  });
});

describe("isPenPointer", () => {
  it("recognises only a pen", () => {
    expect(isPenPointer("pen")).toBe(true);
    expect(isPenPointer("touch")).toBe(false);
    expect(isPenPointer("mouse")).toBe(false);
    expect(isPenPointer("")).toBe(false);
  });
});

describe("stylus-only preference", () => {
  const makeStorage = (initial: Record<string, string> = {}) => {
    const data = { ...initial };
    return {
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
      read: () => data,
    };
  };

  it("defaults to off, so nothing is blocked unasked", () => {
    expect(readStylusOnly(makeStorage())).toBe(false);
    expect(readStylusOnly(undefined)).toBe(false);
  });

  it("round-trips the preference", () => {
    const storage = makeStorage();
    writeStylusOnly(true, storage);
    expect(storage.read()[STYLUS_ONLY_STORAGE_KEY]).toBe("true");
    expect(readStylusOnly(storage)).toBe(true);
  });

  /** Private mode throws on access rather than returning null. */
  it("survives storage that throws", () => {
    const hostile = {
      getItem: vi.fn(() => {
        throw new Error("denied");
      }),
      setItem: vi.fn(() => {
        throw new Error("denied");
      }),
    };
    expect(() => readStylusOnly(hostile)).not.toThrow();
    expect(readStylusOnly(hostile)).toBe(false);
    expect(() => writeStylusOnly(true, hostile)).not.toThrow();
  });
});

describe("shouldAutosave", () => {
  const base = { isDirty: true, isSaving: false, idleThreshold: 2000 };

  it("saves once the surface has been still long enough", () => {
    expect(shouldAutosave({ ...base, idleFor: 2000 })).toBe(true);
    expect(shouldAutosave({ ...base, idleFor: 5000 })).toBe(true);
  });

  /** Excalidraw fires onChange for pointer moves, so this would be a write
      per frame without the idle gate. */
  it("does not save mid-stroke", () => {
    expect(shouldAutosave({ ...base, idleFor: 200 })).toBe(false);
  });

  it("does nothing when there is nothing to save", () => {
    expect(shouldAutosave({ ...base, isDirty: false, idleFor: 9999 })).toBe(
      false,
    );
  });

  it("does not stack a second save on top of one in flight", () => {
    expect(shouldAutosave({ ...base, isSaving: true, idleFor: 9999 })).toBe(
      false,
    );
  });
});

describe("describeSaveState", () => {
  const now = 1_000_000;

  it("reports work in progress", () => {
    expect(
      describeSaveState({ isSaving: true, isDirty: true, savedAt: now, now }),
    ).toBe("Saving…");
  });

  /** Dirty outranks a past save: the last thing drawn is not on the server. */
  it("reports unsaved changes over a previous save", () => {
    expect(
      describeSaveState({
        isSaving: false,
        isDirty: true,
        savedAt: now - 60_000,
        now,
      }),
    ).toBe("Unsaved changes");
  });

  it("says nothing before the first save", () => {
    expect(
      describeSaveState({
        isSaving: false,
        isDirty: false,
        savedAt: null,
        now,
      }),
    ).toBe("");
  });

  it("reads naturally at every scale", () => {
    const at = (agoMs: number) =>
      describeSaveState({
        isSaving: false,
        isDirty: false,
        savedAt: now - agoMs,
        now,
      });

    expect(at(0)).toBe("Saved just now");
    expect(at(30_000)).toBe("Saved 30 seconds ago");
    expect(at(60_000)).toBe("Saved 1 minute ago");
    expect(at(5 * 60_000)).toBe("Saved 5 minutes ago");
    expect(at(2 * 3_600_000)).toBe("Saved 2 hours ago");
  });

  /** A clock that has drifted backwards must not print a negative age. */
  it("never reports a save in the future", () => {
    expect(
      describeSaveState({
        isSaving: false,
        isDirty: false,
        savedAt: now + 5000,
        now,
      }),
    ).toBe("Saved just now");
  });
});
