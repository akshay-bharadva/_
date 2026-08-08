import type { ContactSubmission } from "@/types";

/**
 * What an inbox message *is* at any moment, derived rather than stored.
 *
 * The columns are three independent booleans (`is_read`, `is_archived`,
 * `replied_at`), which is the right storage shape — but the interface needs one
 * answer per row, and computing it in one place means the badge, the filter and
 * the sort can never disagree about what "needs attention" means.
 */

export type InboxState = "unread" | "open" | "replied" | "archived";

export type InboxFilter = "attention" | "all" | "replied" | "archived";

export function messageState(message: ContactSubmission): InboxState {
  if (message.is_archived) return "archived";
  if (message.replied_at) return "replied";
  if (!message.is_read) return "unread";
  return "open";
}

/**
 * A message that is asking something of you.
 *
 * Read-but-unanswered counts: opening a message is not answering it, and an
 * inbox that empties itself the moment you glance at something is how enquiries
 * get lost. Archiving is the deliberate "I am done with this".
 */
export function needsAttention(message: ContactSubmission): boolean {
  const state = messageState(message);
  return state === "unread" || state === "open";
}

export const INBOX_FILTERS: {
  id: InboxFilter;
  label: string;
  empty: string;
}[] = [
  {
    id: "attention",
    label: "Needs reply",
    empty: "Nothing waiting on you.",
  },
  {
    id: "all",
    label: "All",
    empty: "No messages yet.",
  },
  {
    id: "replied",
    label: "Replied",
    empty: "Nothing marked replied yet.",
  },
  {
    id: "archived",
    label: "Archived",
    empty: "Nothing archived.",
  },
];

/** Does this message belong in the named view? */
export function matchesFilter(
  message: ContactSubmission,
  filter: InboxFilter,
): boolean {
  switch (filter) {
    case "attention":
      return needsAttention(message);
    case "replied":
      return !message.is_archived && Boolean(message.replied_at);
    case "archived":
      return message.is_archived;
    // "All" deliberately excludes archived. Archiving is retirement, and a
    // view that shows everything ever received is not an inbox.
    case "all":
      return !message.is_archived;
  }
}

/** Case-insensitive search across the fields a person would remember. */
export function matchesSearch(
  message: ContactSubmission,
  term: string,
): boolean {
  const needle = term.trim().toLowerCase();
  if (needle === "") return true;
  return [message.name, message.email, message.subject, message.message]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export interface InboxCounts {
  attention: number;
  all: number;
  replied: number;
  archived: number;
  unread: number;
}

export function inboxCounts(messages: ContactSubmission[]): InboxCounts {
  return {
    attention: messages.filter((message) => matchesFilter(message, "attention"))
      .length,
    all: messages.filter((message) => matchesFilter(message, "all")).length,
    replied: messages.filter((message) => matchesFilter(message, "replied"))
      .length,
    archived: messages.filter((message) => matchesFilter(message, "archived"))
      .length,
    unread: messages.filter(
      (message) => !message.is_read && !message.is_archived,
    ).length,
  };
}

/**
 * Filter, search, and order for display.
 *
 * Newest first, with one exception: in the attention view an unanswered message
 * from three weeks ago is more urgent than one from this morning, so that view
 * puts the oldest first. Age is the whole signal an inbox has about neglect.
 */
export function visibleMessages(
  messages: ContactSubmission[],
  filter: InboxFilter,
  search: string,
): ContactSubmission[] {
  const matched = messages.filter(
    (message) =>
      matchesFilter(message, filter) && matchesSearch(message, search),
  );

  return matched.sort((a, b) => {
    const left = new Date(a.created_at).getTime();
    const right = new Date(b.created_at).getTime();
    return filter === "attention" ? left - right : right - left;
  });
}

/**
 * A `mailto:` that opens a reply with the thread already quoted.
 *
 * The whole point of the module is answering these, and the app has no outbox
 * — handing the message to whatever the owner already replies from beats
 * building a mail client badly. Every interpolated value is percent-encoded;
 * an unescaped subject line would truncate the URL at its first `&`.
 */
export function replyMailto(message: ContactSubmission): string {
  const subject = message.subject.toLowerCase().startsWith("re:")
    ? message.subject
    : `Re: ${message.subject}`;

  const quoted = message.message
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

  const body = `\n\n---\nOn ${new Date(message.created_at).toLocaleDateString()}, ${message.name} wrote:\n${quoted}\n`;

  return `mailto:${encodeURIComponent(message.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
