"use client";

import { Archive, CornerUpLeft, Mail, MailOpen } from "lucide-react";
import type { ContactSubmission } from "@/types";
import { cn } from "@/lib/cn";
import { inboxTimestamp, messageState, type InboxState } from "./inbox-filters";

/**
 * Icons, not colour alone, carry the state.
 *
 * `chart-2` is the success accent and `chart-3` the warning accent, so both
 * move with all 52 presets — but a reader who cannot separate them still has
 * a filled envelope, an open envelope, an arrow and a box to go on.
 */
const STATE_META: Record<
  InboxState,
  { icon: typeof Mail; label: string; className: string }
> = {
  unread: { icon: Mail, label: "Unread", className: "text-primary" },
  open: {
    icon: MailOpen,
    label: "Read, not replied",
    className: "text-chart-3",
  },
  replied: { icon: CornerUpLeft, label: "Replied", className: "text-chart-2" },
  archived: {
    icon: Archive,
    label: "Archived",
    className: "text-muted-foreground",
  },
};

export function MessageList({
  messages,
  selectedId,
  onSelect,
  emptyMessage,
}: {
  messages: ContactSubmission[];
  selectedId: string | null;
  onSelect: (message: ContactSubmission) => void;
  emptyMessage: string;
}) {
  if (messages.length === 0) {
    return (
      <div className="rounded-surface bg-card p-8 text-center shadow-e1">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  /*
    A message list, not a stack of cards.
    
    Each row was its own elevated surface with a gap between, which is a good
    shape for eight things and a poor one for two hundred: the eye has to
    re-acquire the left edge on every row, and the shadows add visual weight to
    a list whose whole job is to be scanned. One surface holding flush rows
    divided by a hairline is what every mail client converges on, and it is
    also fewer pixels of chrome per message.
  */
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-surface bg-card shadow-e1">
      {messages.map((message) => (
        <li key={message.id}>
          <MessageRow
            message={message}
            selected={message.id === selectedId}
            onSelect={() => onSelect(message)}
          />
        </li>
      ))}
    </ul>
  );
}

function MessageRow({
  message,
  selected,
  onSelect,
}: {
  message: ContactSubmission;
  selected: boolean;
  onSelect: () => void;
}) {
  const state = messageState(message);
  const meta = STATE_META[state];
  const Icon = meta.icon;
  const unread = state === "unread";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "relative w-full py-3 pl-4 pr-3.5 text-left transition-colors",
        selected ? "bg-primary/10" : "hover:bg-secondary/60",
      )}
    >
      {/*
        Unread carries a rail as well as weight. Bold alone is a weak signal
        once a few rows are bold, and it disappears entirely for a reader who
        has the font rendering turned down.
      */}
      {unread && (
        <span
          aria-hidden
          className="absolute inset-y-2 left-0 w-1 rounded-full bg-primary"
        />
      )}

      <div className="flex items-start gap-3">
        <Icon
          className={cn("mt-0.5 size-4 shrink-0", meta.className)}
          aria-hidden
        />

        {/* min-w-0 so the truncation on the children can actually engage. */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p
              className={cn(
                "min-w-0 truncate text-sm",
                unread ? "font-semibold text-foreground" : "text-foreground",
              )}
            >
              {message.name || message.email}
            </p>
            {/*
              An absolute stamp in a fixed shape, the way mail clients write
              it. "3 days ago" has to be decoded before it can be compared
              with the row above, and a column of relative phrases at varying
              lengths does not scan.
            */}
            <time
              dateTime={message.created_at}
              className={cn(
                "shrink-0 text-xs tabular-nums",
                unread
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {inboxTimestamp(message.created_at)}
            </time>
          </div>

          <p
            className={cn(
              "mt-0.5 truncate text-sm",
              unread ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {message.subject}
          </p>

          {/* break-words: clamping does not constrain a single long token. */}
          <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">
            {message.message}
          </p>
        </div>
      </div>

      <span className="sr-only">{meta.label}</span>
    </button>
  );
}
