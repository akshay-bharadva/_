"use client";

import dynamic from "next/dynamic";

// perfect-freehand plus the canvas surface is dead weight on a page that is
// mostly typed notes, so the editor only arrives when a sketch is opened. The
// notes grid still renders thumbnails — those go through `ink-preview`, which
// shares the geometry module but not the pointer plumbing.
const InkEditorLazy = dynamic(
  () => import("./ink-editor").then((mod) => mod.InkEditor),
  {
    ssr: false,
    loading: () => null,
  },
);

export default InkEditorLazy;
