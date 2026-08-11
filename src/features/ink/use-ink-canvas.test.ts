import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type {
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { InkStroke } from "@/types";
import { useInkCanvas } from "./use-ink-canvas";
import {
  DEFAULT_PRESSURE,
  INK_CANVAS_HEIGHT,
  INK_CANVAS_WIDTH,
} from "./ink-types";

/** The surface is rendered at exactly the logical size, so 1 client px = 1 unit. */
const RECT = {
  left: 0,
  top: 0,
  width: INK_CANVAS_WIDTH,
  height: INK_CANVAS_HEIGHT,
};

const target = {
  setPointerCapture: vi.fn(),
  releasePointerCapture: vi.fn(),
  hasPointerCapture: vi.fn(() => true),
};

interface PointerOptions {
  x?: number;
  y?: number;
  pressure?: number;
  pointerType?: "pen" | "touch" | "mouse";
  pointerId?: number;
  coalesced?: Array<{ x: number; y: number; pressure?: number }>;
}

const pointerEvent = ({
  x = 0,
  y = 0,
  pressure = 0.5,
  pointerType = "pen",
  pointerId = 1,
  coalesced,
}: PointerOptions = {}) =>
  ({
    pointerId,
    pointerType,
    clientX: x,
    clientY: y,
    pressure,
    currentTarget: target,
    nativeEvent: {
      clientX: x,
      clientY: y,
      pressure,
      getCoalescedEvents: coalesced
        ? () =>
            coalesced.map((sample) => ({
              clientX: sample.x,
              clientY: sample.y,
              pressure: sample.pressure ?? pressure,
            }))
        : undefined,
    },
  }) as unknown as ReactPointerEvent<SVGSVGElement>;

const setup = (initialStrokes: InkStroke[] = []) => {
  const hook = renderHook(() => useInkCanvas({ initialStrokes }));
  (
    hook.result.current.surfaceRef as MutableRefObject<SVGSVGElement | null>
  ).current = {
    getBoundingClientRect: () => RECT,
  } as unknown as SVGSVGElement;
  return hook;
};

/** Draw one stroke through the given client points. */
const draw = (
  result: { current: ReturnType<typeof useInkCanvas> },
  points: Array<[number, number]>,
) => {
  const [first, ...rest] = points;
  act(() =>
    result.current.handlers.onPointerDown(
      pointerEvent({ x: first[0], y: first[1] }),
    ),
  );
  for (const [x, y] of rest) {
    act(() => result.current.handlers.onPointerMove(pointerEvent({ x, y })));
  }
  act(() =>
    result.current.handlers.onPointerUp(
      pointerEvent({
        x: points[points.length - 1][0],
        y: points[points.length - 1][1],
      }),
    ),
  );
};

describe("useInkCanvas", () => {
  it("starts from the strokes it was seeded with", () => {
    const seed: InkStroke[] = [
      { points: [[1, 2, 0.5]], color: "ink", size: 6 },
    ];
    const { result } = setup(seed);

    expect(result.current.strokes).toBe(seed);
    expect(result.current.isEmpty).toBe(false);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.canUndo).toBe(false);
  });

  it("commits a drawn stroke with the current color and width", () => {
    const { result } = setup();
    act(() => result.current.setColor("accent"));
    act(() => result.current.setSize(12));

    draw(result, [
      [10, 10],
      [20, 30],
    ]);

    expect(result.current.strokes).toHaveLength(1);
    expect(result.current.strokes[0].color).toBe("accent");
    expect(result.current.strokes[0].size).toBe(12);
    expect(result.current.strokes[0].points).toEqual([
      [10, 10, 0.5],
      [20, 30, 0.5],
    ]);
    expect(result.current.isDirty).toBe(true);
  });

  it("shows the stroke in progress before it is committed", () => {
    const { result } = setup();

    act(() =>
      result.current.handlers.onPointerDown(pointerEvent({ x: 5, y: 5 })),
    );
    expect(result.current.liveStroke?.points).toHaveLength(1);
    expect(result.current.strokes).toHaveLength(0);

    act(() =>
      result.current.handlers.onPointerUp(pointerEvent({ x: 5, y: 5 })),
    );
    expect(result.current.liveStroke).toBeNull();
    expect(result.current.strokes).toHaveLength(1);
  });

  it("keeps every coalesced sample, not just the delivered event", () => {
    const { result } = setup();
    act(() =>
      result.current.handlers.onPointerDown(pointerEvent({ x: 0, y: 0 })),
    );

    act(() =>
      result.current.handlers.onPointerMove(
        pointerEvent({
          x: 40,
          y: 40,
          coalesced: [
            { x: 10, y: 10 },
            { x: 20, y: 20 },
            { x: 30, y: 30 },
            { x: 40, y: 40 },
          ],
        }),
      ),
    );

    // Without draining the queue this stroke would be a straight line from
    // 0,0 to 40,40 — which is exactly how fast handwriting goes faceted.
    expect(result.current.liveStroke?.points).toHaveLength(5);
    expect(result.current.liveStroke?.points[2]).toEqual([20, 20, 0.5]);
  });

  it("substitutes a pressure reading for devices that report none", () => {
    const { result } = setup();

    act(() =>
      result.current.handlers.onPointerDown(
        pointerEvent({ x: 1, y: 1, pressure: 0, pointerType: "mouse" }),
      ),
    );

    expect(result.current.liveStroke?.points[0][2]).toBe(DEFAULT_PRESSURE);
  });

  describe("palm rejection", () => {
    it("draws from touch on a device that has no pen", () => {
      const { result } = setup();

      act(() =>
        result.current.handlers.onPointerDown(
          pointerEvent({ pointerType: "touch" }),
        ),
      );

      expect(result.current.liveStroke).not.toBeNull();
    });

    it("ignores touch once a pen has been seen", () => {
      const { result } = setup();

      // One pen contact is enough to classify the device for the session.
      act(() => result.current.handlers.onPointerDown(pointerEvent()));
      act(() => result.current.handlers.onPointerUp(pointerEvent()));

      act(() =>
        result.current.handlers.onPointerDown(
          pointerEvent({ pointerType: "touch", pointerId: 2 }),
        ),
      );

      expect(result.current.liveStroke).toBeNull();
      expect(result.current.strokes).toHaveLength(1);
    });

    it("does not let a second contact hijack the stroke in progress", () => {
      const { result } = setup();

      act(() =>
        result.current.handlers.onPointerDown(pointerEvent({ x: 0, y: 0 })),
      );
      act(() =>
        result.current.handlers.onPointerDown(
          pointerEvent({ x: 500, y: 500, pointerId: 2 }),
        ),
      );
      act(() =>
        result.current.handlers.onPointerMove(
          pointerEvent({ x: 600, y: 600, pointerId: 2 }),
        ),
      );

      expect(result.current.liveStroke?.points).toEqual([[0, 0, 0.5]]);
    });

    it("ignores a pointer-up from a pointer that was not drawing", () => {
      const { result } = setup();
      act(() => result.current.handlers.onPointerDown(pointerEvent()));

      act(() =>
        result.current.handlers.onPointerUp(pointerEvent({ pointerId: 9 })),
      );

      expect(result.current.liveStroke).not.toBeNull();
      expect(result.current.strokes).toHaveLength(0);
    });
  });

  describe("eraser", () => {
    it("removes the stroke it touches", () => {
      const { result } = setup();
      draw(result, [
        [100, 100],
        [110, 100],
      ]);

      act(() => result.current.setTool("eraser"));
      act(() =>
        result.current.handlers.onPointerDown(pointerEvent({ x: 105, y: 100 })),
      );

      expect(result.current.strokes).toHaveLength(0);
    });

    it("leaves strokes it does not touch", () => {
      const { result } = setup();
      draw(result, [
        [100, 100],
        [110, 100],
      ]);

      act(() => result.current.setTool("eraser"));
      act(() =>
        result.current.handlers.onPointerDown(pointerEvent({ x: 800, y: 800 })),
      );

      expect(result.current.strokes).toHaveLength(1);
    });

    it("does not stack history entries while dragging over blank paper", () => {
      const { result } = setup();
      act(() => result.current.setTool("eraser"));

      act(() =>
        result.current.handlers.onPointerDown(pointerEvent({ x: 10, y: 10 })),
      );
      act(() =>
        result.current.handlers.onPointerMove(pointerEvent({ x: 20, y: 20 })),
      );
      act(() =>
        result.current.handlers.onPointerMove(pointerEvent({ x: 30, y: 30 })),
      );

      expect(result.current.canUndo).toBe(false);
      expect(result.current.isDirty).toBe(false);
    });
  });

  describe("history", () => {
    it("undoes and redoes a stroke", () => {
      const { result } = setup();
      draw(result, [[10, 10]]);
      draw(result, [[20, 20]]);
      expect(result.current.strokes).toHaveLength(2);

      act(() => result.current.undo());
      expect(result.current.strokes).toHaveLength(1);
      expect(result.current.canRedo).toBe(true);

      act(() => result.current.redo());
      expect(result.current.strokes).toHaveLength(2);
      expect(result.current.canRedo).toBe(false);
    });

    it("drops the redo stack once a new stroke is drawn", () => {
      const { result } = setup();
      draw(result, [[10, 10]]);
      act(() => result.current.undo());
      expect(result.current.canRedo).toBe(true);

      draw(result, [[50, 50]]);

      expect(result.current.canRedo).toBe(false);
      expect(result.current.strokes).toHaveLength(1);
    });

    it("is a no-op at either end of the stack", () => {
      const { result } = setup();

      act(() => result.current.undo());
      act(() => result.current.redo());

      expect(result.current.strokes).toHaveLength(0);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });

    it("makes a clear undoable", () => {
      const { result } = setup();
      draw(result, [[10, 10]]);

      act(() => result.current.clear());
      expect(result.current.isEmpty).toBe(true);

      act(() => result.current.undo());
      expect(result.current.strokes).toHaveLength(1);
    });
  });

  describe("dirty tracking", () => {
    it("clears once the sketch has been saved", () => {
      const { result } = setup();
      draw(result, [[10, 10]]);
      expect(result.current.isDirty).toBe(true);

      act(() => result.current.markSaved());
      expect(result.current.isDirty).toBe(false);

      draw(result, [[20, 20]]);
      expect(result.current.isDirty).toBe(true);
    });

    it("is set by an undo, not just by drawing", () => {
      const { result } = setup();
      draw(result, [[10, 10]]);
      act(() => result.current.markSaved());

      act(() => result.current.undo());

      expect(result.current.isDirty).toBe(true);
    });
  });
});
