"use client";

import { Excalidraw, Footer } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawTheme } from "./whiteboard-theme";
import type { InitialSceneData } from "./scene-io";

interface ExcalidrawCanvasProps {
  initialData: InitialSceneData;
  theme: ExcalidrawTheme;
  /** Handed the imperative API once mounted, for reading the scene on save. */
  onApiReady: (api: ExcalidrawImperativeAPI) => void;
  /**
   * Handed the live element array, not just "something happened".
   *
   * The library fires this for pointer moves, selection and its own initial
   * load, so the callback cannot tell whether the drawing changed without
   * seeing it — which is why the previous `() => void` signature turned every
   * board open into an unsaved-changes prompt.
   */
  onChange: (elements: readonly unknown[]) => void;
  /**
   * Board actions, rendered into Excalidraw's own top-right slot.
   *
   * Not absolutely positioned over the canvas: the library already owns the
   * top-left (menu), top-centre (toolbar) and top-right (library) of its own
   * surface, and anything floated there collides with one of them at some
   * viewport width. These two props are the supported way in, so the chrome
   * moves with Excalidraw's layout instead of guessing at it.
   */
  topRight?: React.ReactNode;
  /** Title and save state, rendered into Excalidraw's footer. */
  footer?: React.ReactNode;
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
  topRight,
  footer,
}: ExcalidrawCanvasProps) {
  return (
    // Full-bleed: the canvas is the screen. A bordered, rounded box inside a
    // padded panel put two frames around the one thing the page is for, and on
    // a tablet every row of chrome is a row of drawing area.
    <div className="size-full overflow-hidden">
      <Excalidraw
        // The library reads initialData once; the editor remounts it with a
        // key when a different board is opened.
        initialData={initialData as never}
        theme={theme}
        excalidrawAPI={onApiReady}
        onChange={(elements) => onChange(elements)}
        UIOptions={{
          canvasActions: {
            // Loading a file would swap the scene out from under the row this
            // editor is bound to; export stays available.
            loadScene: false,
          },
        }}
        renderTopRightUI={topRight ? () => <>{topRight}</> : undefined}
      >
        {footer ? <Footer>{footer}</Footer> : null}
      </Excalidraw>
    </div>
  );
}

export default ExcalidrawCanvas;
