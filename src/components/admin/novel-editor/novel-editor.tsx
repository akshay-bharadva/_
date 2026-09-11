"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { getExtensions } from "./extensions";
import {
  BLOCK_COMMANDS,
  TURN_INTO_COMMANDS,
  filterCommands,
  slashQuery,
  type BlockCommand,
  type SlashMatch,
} from "./slash-commands";
import { SlashMenu } from "./slash-menu";
import { BubbleToolbar } from "./bubble-toolbar";
import { BlockHandle } from "./block-handle";
import { blockOfSelection, moveBlock } from "./block-actions";

export interface NovelEditorProps {
  /** Markdown in, markdown out. */
  value: string;
  onChange: (value: string) => void;
  /** Enables the Image block, and pasting or dropping an image. */
  onImageUpload?: (file: File) => Promise<string>;
  /** Shown while the whole editor is empty. */
  placeholder?: string;
  /** The writable area's minimum height; beyond it the editor grows with its content. */
  minHeight?: string;
  /** `prose` holds long-form writing to a reading measure, a little larger. */
  measure?: "full" | "prose";
  /** `page` is part of the surface it sits on; `field` is framed like an input, for forms. */
  variant?: "page" | "field";
  editable?: boolean;
  className?: string;
}

function getMarkdown(editor: Editor): string {
  return (
    editor.storage as unknown as Record<string, MarkdownStorage>
  ).markdown.getMarkdown();
}

/**
 * The block editor, in the manner of Notion.
 *
 * No toolbar and no frame: the text is the interface. Type `/` for any block
 * type, select text for formatting, and use the handle in the margin to add,
 * convert, move or drag a block. Markdown shortcuts (`#`, `-`, `[]`, `>`,
 * ` ``` `, `---`) work as you type.
 *
 * It grows with what is written — the page scrolls, never the editor. The old
 * one was a bordered box with a sticky bar of thirty buttons and its own
 * scroll area, which read as an attachment sitting on the page rather than
 * the page itself.
 */
export default function NovelEditor({
  value,
  onChange,
  onImageUpload,
  placeholder = "Write something, or press '/' for commands…",
  minHeight = "12rem",
  measure = "full",
  variant = "page",
  editable = true,
  className,
}: NovelEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const [slash, setSlash] = useState<SlashMatch | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const slashRef = useRef(slash);
  slashRef.current = slash;
  /** The slash the user dismissed with Escape, so it does not reopen. */
  const dismissedAt = useRef<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const uploadRef = useRef(onImageUpload);
  uploadRef.current = onImageUpload;

  const commands = onImageUpload
    ? BLOCK_COMMANDS
    : BLOCK_COMMANDS.filter((c) => c.id !== "image");
  const items = slash ? filterCommands(commands, slash.query) : [];
  const activeIndex = Math.min(slashIndex, Math.max(items.length - 1, 0));

  // The editor's key handler is created once; it reads the menu from here.
  const menu = useRef({ open: false, items: [] as BlockCommand[], index: 0 });
  menu.current = { open: !!slash && items.length > 0, items, index: activeIndex };

  const insertImage = useCallback(async (file: File, at?: number) => {
    const upload = uploadRef.current;
    const editor = editorRef.current;
    if (!upload || !editor) return;
    setIsUploading(true);
    try {
      const src = await upload(file);
      if (src) {
        const chain = editor.chain().focus();
        (at === undefined
          ? chain.setImage({ src })
          : chain.insertContentAt(at, { type: "image", attrs: { src } })
        ).run();
      }
    } catch {
      toast.error("Couldn't upload that image.");
    } finally {
      setIsUploading(false);
    }
  }, []);
  const insertImageRef = useRef(insertImage);
  insertImageRef.current = insertImage;

  const runCommand = (command: BlockCommand) => {
    const editor = editorRef.current;
    const match = slashRef.current;
    if (!editor) return;
    if (match) {
      editor.chain().focus().deleteRange({ from: match.from, to: match.to }).run();
    }
    setSlash(null);
    if (command.id === "image") {
      fileInputRef.current?.click();
      return;
    }
    command.run(editor);
  };
  const runCommandRef = useRef(runCommand);
  runCommandRef.current = runCommand;

  const syncSlash = (editor: Editor) => {
    const match = editor.isEditable ? slashQuery(editor.state) : null;
    if (!match) {
      dismissedAt.current = null;
      setSlash(null);
      return;
    }
    if (dismissedAt.current === match.from) {
      setSlash(null);
      return;
    }
    setSlash(match);
    setSlashIndex(0);
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      ...getExtensions(placeholder),
      Markdown.configure({
        html: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: value,
    editable,
    editorProps: {
      attributes: { style: `min-height: ${minHeight}` },
      handleKeyDown: (_view, event) => {
        const m = menu.current;
        if (m.open) {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            setSlashIndex((m.index + step + m.items.length) % m.items.length);
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            const command = m.items[m.index];
            if (command) runCommandRef.current(command);
            return true;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            dismissedAt.current = slashRef.current?.from ?? null;
            setSlash(null);
            return true;
          }
        }

        if (
          event.altKey &&
          event.shiftKey &&
          (event.key === "ArrowUp" || event.key === "ArrowDown")
        ) {
          const current = editorRef.current;
          const block = current && blockOfSelection(current.state);
          if (!current || !block) return false;
          event.preventDefault();
          moveBlock(current, block.pos, event.key === "ArrowUp" ? -1 : 1);
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const file = Array.from(event.clipboardData?.files ?? []).find((f) =>
          f.type.startsWith("image/"),
        );
        if (!file || !uploadRef.current) return false;
        event.preventDefault();
        void insertImageRef.current(file);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const file = Array.from(event.dataTransfer?.files ?? []).find((f) =>
          f.type.startsWith("image/"),
        );
        if (!file || !uploadRef.current) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
        void insertImageRef.current(file, at?.pos);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      onChangeRef.current(getMarkdown(current));
      syncSlash(current);
    },
    onSelectionUpdate: ({ editor: current }) => syncSlash(current),
    onBlur: () => setSlash(null),
  });
  editorRef.current = editor;

  // Content replaced from outside — another note opened, a revision restored.
  useEffect(() => {
    if (editor && value !== getMarkdown(editor)) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editor, editable]);

  if (!editor) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight }}>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- a click in the padding focuses the text
    <div
      ref={rootRef}
      data-measure={measure}
      onMouseDown={(event) => {
        // A click in the padding, or in the empty space below the last block,
        // goes to the end — with a fresh line to write on if the document ends
        // in a heading, list, table or code block, as Notion does.
        const target = event.target as HTMLElement;
        const prose = editor.view.dom;
        if (target !== event.currentTarget && target !== prose) return;
        const lastDom = prose.lastElementChild;
        if (
          target === prose &&
          lastDom &&
          event.clientY < lastDom.getBoundingClientRect().bottom
        ) {
          return;
        }
        event.preventDefault();
        const last = editor.state.doc.lastChild;
        const endsOnEmptyLine =
          last?.type.name === "paragraph" && last.content.size === 0;
        if (editor.isEditable && last && !endsOnEmptyLine) {
          editor
            .chain()
            .insertContentAt(editor.state.doc.content.size, { type: "paragraph" })
            .focus("end")
            .run();
        } else {
          editor.commands.focus("end");
        }
      }}
      className={cn(
        // Never clipped: the block handle hangs in the margin to the left.
        "novel-editor relative",
        // The measure is set here rather than on the text, so the handle in
        // the margin stays beside the column instead of at the page edge.
        measure === "prose" && "mx-auto w-full max-w-[46rem]",
        variant === "field" &&
          "rounded-control border border-input bg-background px-3 py-2 transition-shadow focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    >
      {editable && variant === "page" && (
        <BlockHandle
          editor={editor}
          containerRef={rootRef}
          blocks={TURN_INTO_COMMANDS}
        />
      )}
      {editable && <BubbleToolbar editor={editor} blocks={TURN_INTO_COMMANDS} />}

      <EditorContent editor={editor} />

      {slash && items.length > 0 && (
        <SlashMenu
          editor={editor}
          at={slash.from}
          items={items}
          index={activeIndex}
          onHover={setSlashIndex}
          onPick={(command) => runCommandRef.current(command)}
        />
      )}

      {onImageUpload && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void insertImage(file);
            event.target.value = "";
          }}
        />
      )}

      {isUploading && (
        <div
          role="status"
          className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-2 rounded-full bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground shadow-e2"
        >
          <Loader2 className="size-3 animate-spin" aria-hidden />
          Uploading image…
        </div>
      )}
    </div>
  );
}
