import { describe, expect, it } from "vitest";
import type { Whiteboard } from "@/types";
import {
  PREVIEW_MAX_CHARS,
  isEmptyScene,
  sceneFromJson,
  toInitialData,
  withinPreviewBudget,
} from "./scene-io";

const board = (overrides: Partial<Whiteboard> = {}): Whiteboard => ({
  id: "board-1",
  ...overrides,
});

describe("sceneFromJson", () => {
  it("splits a serialized scene into its three columns", () => {
    const json = JSON.stringify({
      type: "excalidraw",
      elements: [{ id: "el-1" }],
      appState: { viewBackgroundColor: "#fff" },
      files: { "file-1": { dataURL: "data:," } },
    });

    expect(sceneFromJson(json)).toEqual({
      elements: [{ id: "el-1" }],
      app_state: { viewBackgroundColor: "#fff" },
      files: { "file-1": { dataURL: "data:," } },
    });
  });

  it("drops session-only appState so a board never restores someone's selection", () => {
    const json = JSON.stringify({
      appState: {
        viewBackgroundColor: "#fff",
        collaborators: [{ id: "who" }],
        selectedElementIds: { "el-1": true },
        selectedGroupIds: { "g-1": true },
        editingGroupId: "g-1",
        isLoading: true,
        errorMessage: "boom",
        theme: "dark",
      },
    });

    expect(sceneFromJson(json).app_state).toEqual({
      viewBackgroundColor: "#fff",
    });
  });

  it("fills in the pieces a partial payload is missing", () => {
    expect(sceneFromJson(JSON.stringify({}))).toEqual({
      elements: [],
      app_state: {},
      files: {},
    });
  });

  it("returns an empty scene rather than throwing on unparseable JSON", () => {
    expect(sceneFromJson("not json")).toEqual({
      elements: [],
      app_state: {},
      files: {},
    });
  });
});

describe("toInitialData", () => {
  it("maps a stored row onto Excalidraw's initialData shape", () => {
    const initial = toInitialData(
      board({
        elements: [{ id: "el-1" }],
        app_state: { viewBackgroundColor: "#eee" },
        files: { "file-1": {} },
      }),
    );

    expect(initial).toEqual({
      elements: [{ id: "el-1" }],
      appState: { viewBackgroundColor: "#eee" },
      files: { "file-1": {} },
    });
  });

  it("strips transient appState on the way in too, for rows that predate it", () => {
    const initial = toInitialData(
      board({ app_state: { theme: "dark", collaborators: [], gridSize: 20 } }),
    );

    expect(initial.appState).toEqual({ gridSize: 20 });
  });

  it("gives a blank scene for a new board", () => {
    expect(toInitialData(null)).toEqual({
      elements: [],
      appState: {},
      files: {},
    });
  });

  it("gives a blank scene for a row with null columns", () => {
    expect(toInitialData(board({ app_state: null, files: null }))).toEqual({
      elements: [],
      appState: {},
      files: {},
    });
  });
});

describe("isEmptyScene", () => {
  it("is true when nothing has been drawn", () => {
    expect(isEmptyScene({ elements: [], app_state: {}, files: {} })).toBe(true);
  });

  it("is true when the elements key is absent", () => {
    expect(isEmptyScene({ app_state: {}, files: {} })).toBe(true);
  });

  it("is false once a single element exists", () => {
    expect(isEmptyScene({ elements: [{ id: "el-1" }] })).toBe(false);
  });
});

describe("withinPreviewBudget", () => {
  it("accepts a small thumbnail", () => {
    expect(withinPreviewBudget("<svg />")).toBe(true);
  });

  it("accepts one exactly at the limit", () => {
    expect(withinPreviewBudget("x".repeat(PREVIEW_MAX_CHARS))).toBe(true);
  });

  it("rejects one past the limit", () => {
    expect(withinPreviewBudget("x".repeat(PREVIEW_MAX_CHARS + 1))).toBe(false);
  });

  it("rejects a missing thumbnail", () => {
    expect(withinPreviewBudget(null)).toBe(false);
    expect(withinPreviewBudget("")).toBe(false);
  });
});
