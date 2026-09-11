"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { cn } from "@/lib/cn";
import type { BlockCommand } from "./slash-commands";

/**
 * The "/" menu: every block type with what it is for and its markdown
 * shortcut, filtered as you type after the slash. Keyboard handling lives in
 * the editor (arrows, Enter, Escape), so the text never loses focus.
 */
export function SlashMenu({
  editor,
  at,
  items,
  index,
  onHover,
  onPick,
}: {
  editor: Editor;
  /** Document position of the slash. */
  at: number;
  items: BlockCommand[];
  index: number;
  onHover: (index: number) => void;
  onPick: (command: BlockCommand) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);

  // Fixed to the viewport, so it has to follow the page when it scrolls.
  useEffect(() => {
    const reposition = () => setTick((t) => t + 1);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, []);

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);

  let coords: { left: number; top: number; bottom: number };
  try {
    coords = editor.view.coordsAtPos(at);
  } catch {
    return null;
  }

  // Opens upwards when there is not room below.
  const below = window.innerHeight - coords.bottom;
  const up = below < 320 && coords.top > below;
  const style = {
    left: Math.max(8, Math.min(coords.left, window.innerWidth - 296)),
    ...(up
      ? { bottom: window.innerHeight - coords.top + 6 }
      : { top: coords.bottom + 6 }),
  };

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Insert a block"
      style={style}
      // Keeps the editor focused while the menu is clicked.
      onMouseDown={(event) => event.preventDefault()}
      className="fixed z-50 max-h-80 w-72 overflow-y-auto rounded-surface bg-popover p-1.5 text-popover-foreground shadow-e3"
    >
      {items.map((item, i) => {
        const Icon = item.icon;
        const heading = i === 0 || items[i - 1].group !== item.group;
        return (
          <div key={item.id}>
            {heading && (
              <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                {item.group}
              </p>
            )}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- the editor owns the keyboard */}
            <div
              role="option"
              aria-selected={i === index}
              data-active={i === index}
              tabIndex={-1}
              onMouseEnter={() => onHover(i)}
              onClick={() => onPick(item)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-control px-2 py-1.5",
                i === index && "bg-secondary",
              )}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-background shadow-e1">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.description}
                </span>
              </span>
              {item.shortcut && (
                <kbd className="shrink-0 text-xs text-muted-foreground">
                  {item.shortcut}
                </kbd>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
