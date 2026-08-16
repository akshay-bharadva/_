"use client";

import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawTheme } from "./whiteboard-theme";
import type { InitialSceneData } from "./scene-io";

interface ExcalidrawCanvasProps {
  initialData: InitialSceneData;
  theme: ExcalidrawTheme;
  /** Handed the imperative API once mounted, for reading the scene on save. */
  onApiReady: (api: ExcalidrawImperativeAPI) => void;
  onChange: () => void;
}

/**
 * The Excalidraw mount itself, kept in its own module so `next/dynamic` has a
 * single chunk boundary to split on — the library and its stylesheet are far
 * larger than the rest of the admin bundle combined, and nothing outside this
 * route should pay for them.
 */
export function ExcalidrawCanvas({
  initialData,
  theme,
  onApiReady,
  onChange,
}: ExcalidrawCanvasProps) {
  return (
    <div className="size-full overflow-hidden rounded-surface border">
      <Excalidraw
        // The library reads initialData once; the editor remounts it with a
        // key when a different board is opened.
        initialData={initialData as never}
        theme={theme}
        excalidrawAPI={onApiReady}
        onChange={onChange}
        UIOptions={{
          canvasActions: {
            // Loading a file would swap the scene out from under the row this
            // editor is bound to; export stays available.
            loadScene: false,
          },
        }}
      />
    </div>
  );
}

export default ExcalidrawCanvas;
