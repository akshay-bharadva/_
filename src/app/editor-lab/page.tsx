"use client";

import { useState } from "react";
import NovelEditor from "@/components/admin/novel-editor";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export default function EditorLab() {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState("# Hello\n\nSome *markdown* content.\n");
  const [b, setB] = useState("# Sheet\n\nInside a sheet.\n");

  return (
    <div className="flex h-screen flex-col gap-4 p-6">
      <Button onClick={() => setOpen(true)}>open sheet</Button>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
        <NovelEditor
          value={a}
          onChange={setA}
          minHeight="100%"
          className="h-full border-none"
          isRounded={false}
        />
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex h-full w-full flex-col sm:max-w-xl md:max-w-2xl">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-card">
            <NovelEditor
              value={b}
              onChange={setB}
              minHeight="100%"
              isRounded={false}
              className="h-full border-none"
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
