"use client";

import { formatDistanceToNow } from "date-fns";
import { Archive, CornerUpLeft, Mail, MailOpen } from "lucide-react";
import type { ContactSubmission } from "@/types";
import { cn } from "@/lib/cn";
import { messageState, type InboxState } from "./inbox-filters";

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

  return (
    <ul className="space-y-2">
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
        "w-full rounded-surface bg-card p-3.5 text-left transition-shadow duration-200 ease-enter",
        selected
          ? "shadow-e3 ring-2 ring-primary"
          : "shadow-e1 hover:shadow-e2",
      )}
    >
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
            <time
              dateTime={message.created_at}
              className="shrink-0 text-xs tabular-nums text-muted-foreground"
            >
              {formatDistanceToNow(new Date(message.created_at), {
                addSuffix: true,
              })}
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
