"use client";

import { format } from "date-fns";
import {
  Archive,
  ArchiveRestore,
  Check,
  Copy,
  MailOpen,
  Reply,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { ContactSubmission } from "@/types";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { messageState, replyMailto } from "./inbox-filters";

/**
 * One message, and the four things you can do with it.
 *
 * There is no reply box. The app has no outbox, no sending domain and no
 * deliverability story, so a compose form here would be a worse mail client
 * pretending to be a feature — `Reply` opens whatever the owner already sends
 * mail from, with the thread quoted.
 */
export function MessageDetail({
  message,
  onUpdate,
  onDelete,
  busy,
}: {
  message: ContactSubmission;
  onUpdate: (changes: Partial<ContactSubmission>) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const confirm = useConfirm();
  const state = messageState(message);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(message.email);
      toast.success("Email address copied");
    } catch {
      toast.error("Could not copy", {
        description: "Your browser blocked clipboard access.",
      });
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: "Delete this message?",
      description:
        "It is removed from the database permanently. Archiving keeps it out of the way without losing it.",
      confirmText: "Delete",
      variant: "destructive",
    });
    if (ok) onDelete();
  };

  return (
    <article className="flex h-full flex-col gap-5 rounded-surface bg-card p-5 shadow-e2 sm:p-6">
      <header className="space-y-3">
        <h2 className="text-lg font-semibold leading-tight text-foreground">
          {message.subject}
        </h2>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-medium text-foreground">{message.name}</span>
          <a
            href={`mailto:${message.email}`}
            className="min-w-0 truncate text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            {message.email}
          </a>
          <button
            type="button"
            onClick={copyEmail}
            aria-label="Copy email address"
            className="rounded-control p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Copy className="size-3.5" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          <time dateTime={message.created_at}>
            {format(new Date(message.created_at), "d MMM yyyy, HH:mm")}
          </time>
          {message.replied_at && (
            <>
              {" · replied "}
              <time dateTime={message.replied_at}>
                {format(new Date(message.replied_at), "d MMM yyyy")}
              </time>
            </>
          )}
        </p>
      </header>

      {/*
        Rendered as plain text on purpose. This is the one field in the app
        written by a stranger; running it through a markdown pipeline would
        hand an anonymous visitor a rendering surface in the admin.
        `whitespace-pre-wrap` keeps their paragraphs, `break-words` survives a
        single unbroken 5,000-character token.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
          {message.message}
        </p>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button asChild size="sm" disabled={busy}>
          <a
            href={replyMailto(message)}
            onClick={() => {
              // Marking on click rather than on return: nothing tells the page
              // whether the mail was actually sent, and an unanswered message
              // that says "replied" is the failure that matters here — so the
              // owner can always toggle it back.
              if (!message.replied_at) {
                onUpdate({ replied_at: new Date().toISOString() });
              }
            }}
          >
            <Reply className="mr-1.5 size-3.5" />
            Reply
          </a>
        </Button>

        {message.replied_at ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onUpdate({ replied_at: null })}
          >
            <MailOpen className="mr-1.5 size-3.5" />
            Mark unanswered
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onUpdate({ replied_at: new Date().toISOString() })}
          >
            <Check className="mr-1.5 size-3.5" />
            Mark replied
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => onUpdate({ is_archived: !message.is_archived })}
        >
          {state === "archived" ? (
            <>
              <ArchiveRestore className="mr-1.5 size-3.5" />
              Restore
            </>
          ) : (
            <>
              <Archive className="mr-1.5 size-3.5" />
              Archive
            </>
          )}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={remove}
          className="ml-auto text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="mr-1.5 size-3.5" />
          Delete
        </Button>
      </footer>
    </article>
  );
}
