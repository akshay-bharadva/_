import { describe, it, expect } from "vitest";
import type { InkPoint, InkStroke } from "@/types";
import {
  buildPreview,
  clientToCanvas,
  downsamplePoints,
  eraseAt,
  outlineToPath,
  quantizePoint,
  quantizeStroke,
  strokeHitTest,
  strokeToPath,
  strokesBounds,
} from "./ink-geometry";
import { INK_CANVAS_HEIGHT, INK_CANVAS_WIDTH } from "./ink-types";

const line = (
  points: InkPoint[],
  overrides: Partial<InkStroke> = {},
): InkStroke => ({
  points,
  color: "ink",
  size: 6,
  ...overrides,
});

const horizontal = (y: number, from = 0, to = 100): InkStroke =>
  line(Array.from({ length: to - from + 1 }, (_, i) => [from + i, y, 0.5]));

describe("clientToCanvas", () => {
  const rect = { left: 100, top: 50, width: 700, height: 495 };

  it("maps a client point into the fixed canvas space", () => {
    // The surface is rendered at half the logical size here, so the midpoint of
    // the box must land at the midpoint of the canvas.
    expect(
      clientToCanvas(450, 297.5, rect, INK_CANVAS_WIDTH, INK_CANVAS_HEIGHT),
    ).toEqual([INK_CANVAS_WIDTH / 2, INK_CANVAS_HEIGHT / 2]);
  });

  it("puts the top-left corner at the origin", () => {
    expect(
      clientToCanvas(100, 50, rect, INK_CANVAS_WIDTH, INK_CANVAS_HEIGHT),
    ).toEqual([0, 0]);
  });

  it("scales identically at any container size", () => {
    const small = { left: 0, top: 0, width: 350, height: 247.5 };
    const large = { left: 0, top: 0, width: 1400, height: 990 };
    const a = clientToCanvas(
      175,
      0,
      small,
      INK_CANVAS_WIDTH,
      INK_CANVAS_HEIGHT,
    );
    const b = clientToCanvas(
      700,
      0,
      large,
      INK_CANVAS_WIDTH,
      INK_CANVAS_HEIGHT,
    );
    expect(a).toEqual(b);
  });

  it("returns the origin for a zero-sized rect", () => {
    // A canvas measured before layout must not produce NaN coordinates.
    const collapsed = { left: 0, top: 0, width: 0, height: 0 };
    expect(
      clientToCanvas(10, 10, collapsed, INK_CANVAS_WIDTH, INK_CANVAS_HEIGHT),
    ).toEqual([0, 0]);
  });
});

describe("quantizePoint", () => {
  it("keeps one decimal of position and two of pressure", () => {
    expect(quantizePoint([12.3456, 78.9123, 0.456789])).toEqual([
      12.3, 78.9, 0.46,
    ]);
  });

  it("leaves already-round values alone", () => {
    expect(quantizePoint([10, 20, 0.5])).toEqual([10, 20, 0.5]);
  });

  it("applies to every point of a stroke without touching its style", () => {
    const stroke = quantizeStroke(
      line([[1.111, 2.222, 0.333]], { color: "accent", size: 12 }),
    );
    expect(stroke.points).toEqual([[1.1, 2.2, 0.33]]);
    expect(stroke.color).toBe("accent");
    expect(stroke.size).toBe(12);
  });
});

describe("strokeHitTest", () => {
  const stroke = horizontal(50);

  it("hits a point on the stroke", () => {
    expect(strokeHitTest(stroke, 50, 50)).toBe(true);
  });

  it("misses a point beyond the eraser reach", () => {
    expect(strokeHitTest(stroke, 50, 200)).toBe(false);
  });

  it("widens the target with the stroke width", () => {
    const thin = horizontal(50);
    const broad = { ...horizontal(50), size: 60 };
    // 40px away: outside a fine line's reach, inside a broad one's.
    expect(strokeHitTest(thin, 50, 90)).toBe(false);
    expect(strokeHitTest(broad, 50, 90)).toBe(true);
  });

  it("honors an explicit radius", () => {
    expect(strokeHitTest(stroke, 50, 90, 5)).toBe(false);
    expect(strokeHitTest(stroke, 50, 90, 100)).toBe(true);
  });
});

describe("eraseAt", () => {
  it("removes only the strokes under the eraser", () => {
    const strokes = [horizontal(50), horizontal(500)];
    const result = eraseAt(strokes, 50, 50);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(strokes[1]);
  });

  it("removes every overlapping stroke at once", () => {
    const strokes = [horizontal(50), horizontal(52), horizontal(500)];
    expect(eraseAt(strokes, 50, 51)).toHaveLength(1);
  });

  it("returns the same array when nothing was hit", () => {
    // Identity is the signal the hook uses to skip a history entry, so a
    // dragged eraser over blank paper does not fill the undo stack.
    const strokes = [horizontal(50)];
    expect(eraseAt(strokes, 900, 900)).toBe(strokes);
  });

  it("handles an empty canvas", () => {
    const strokes: InkStroke[] = [];
    expect(eraseAt(strokes, 10, 10)).toBe(strokes);
  });
});

describe("downsamplePoints", () => {
  const points: InkPoint[] = Array.from({ length: 100 }, (_, i) => [i, i, 0.5]);

  it("thins to the requested count", () => {
    expect(downsamplePoints(points, 10)).toHaveLength(10);
  });

  it("always keeps the first and last sample", () => {
    const result = downsamplePoints(points, 5);
    expect(result[0]).toEqual(points[0]);
    expect(result[result.length - 1]).toEqual(points[points.length - 1]);
  });

  it("leaves a stroke shorter than the cap untouched", () => {
    const short: InkPoint[] = [
      [0, 0, 0.5],
      [1, 1, 0.5],
    ];
    expect(downsamplePoints(short, 10)).toBe(short);
  });

  it("refuses to thin below two points", () => {
    expect(downsamplePoints(points, 1)).toBe(points);
  });
});

describe("buildPreview", () => {
  it("caps points per stroke and quantizes what it keeps", () => {
    const dense = line(
      Array.from({ length: 500 }, (_, i) => [i / 3, i / 7, 0.512345]),
    );

    const [preview] = buildPreview([dense], 12);

    expect(preview.points).toHaveLength(12);
    expect(preview.points[0][2]).toBe(0.51);
    // Style survives so the thumbnail matches the sketch.
    expect(preview.color).toBe("ink");
    expect(preview.size).toBe(6);
  });

  it("is much smaller than the record it summarizes", () => {
    const strokes = Array.from({ length: 20 }, () =>
      line(Array.from({ length: 400 }, (_, i) => [i, i, 0.5])),
    );

    const full = JSON.stringify(strokes).length;
    const preview = JSON.stringify(buildPreview(strokes)).length;

    expect(preview).toBeLessThan(full / 10);
  });

  it("returns an empty list for an empty sketch", () => {
    expect(buildPreview([])).toEqual([]);
  });
});

describe("strokesBounds", () => {
  it("spans every point of every stroke", () => {
    expect(
      strokesBounds([
        line([
          [10, 20, 0.5],
          [30, 40, 0.5],
        ]),
        line([[5, 100, 0.5]]),
      ]),
    ).toEqual({ x: 5, y: 20, width: 25, height: 80 });
  });

  it("is null for an empty sketch", () => {
    expect(strokesBounds([])).toBeNull();
    expect(strokesBounds([line([])])).toBeNull();
  });
});

describe("outlineToPath", () => {
  it("returns a closed quadratic path", () => {
    const path = outlineToPath([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    expect(path.startsWith("M0.00,0.00Q")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
  });

  it("returns nothing for an outline too short to fill", () => {
    expect(outlineToPath([])).toBe("");
    expect(outlineToPath([[0, 0]])).toBe("");
  });
});

describe("strokeToPath", () => {
  it("produces a fillable path for a real stroke", () => {
    const path = strokeToPath(horizontal(50));
    expect(path).toMatch(/^M[\d.]+,[\d.]+Q/);
    expect(path.endsWith("Z")).toBe(true);
  });

  it("produces a dot for a single tap", () => {
    expect(strokeToPath(line([[10, 10, 0.5]]))).not.toBe("");
  });

  it("scales with the stroke width", () => {
    const thin = strokeToPath(line([[10, 10, 0.5]], { size: 2 }));
    const broad = strokeToPath(line([[10, 10, 0.5]], { size: 40 }));
    expect(broad.length).toBeGreaterThan(0);
    expect(broad).not.toBe(thin);
  });
});
