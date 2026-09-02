import { describe, it, expect } from "vitest";
import type { ContactSubmission } from "@/types";
import {
  inboxCounts,
  matchesFilter,
  matchesSearch,
  messageState,
  needsAttention,
  replyMailto,
  visibleMessages,
  inboxTimestamp,
} from "./inbox-filters";
import { isDiscordWebhook } from "@/features/integrations/discord-webhook";

const message = (
  overrides: Partial<ContactSubmission> = {},
): ContactSubmission => ({
  id: "1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  subject: "Analytical engine",
  message: "Do you take contract work?",
  is_read: false,
  is_archived: false,
  replied_at: null,
  created_at: "2026-08-01T09:00:00.000Z",
  ...overrides,
});

describe("messageState", () => {
  it("names each of the four states", () => {
    expect(messageState(message())).toBe("unread");
    expect(messageState(message({ is_read: true }))).toBe("open");
    expect(
      messageState(message({ is_read: true, replied_at: "2026-08-02" })),
    ).toBe("replied");
    expect(messageState(message({ is_archived: true }))).toBe("archived");
  });

  /** Archiving is the final word: an archived message is out, however it got there. */
  it("lets archived win over replied and unread", () => {
    expect(
      messageState(message({ is_archived: true, replied_at: "2026-08-02" })),
    ).toBe("archived");
    expect(messageState(message({ is_archived: true, is_read: false }))).toBe(
      "archived",
    );
  });
});

describe("needsAttention", () => {
  /**
   * The distinction the module exists for: opening a message is not answering
   * it. An inbox that clears itself when you glance at something is how
   * enquiries get lost.
   */
  it("keeps a read but unanswered message", () => {
    expect(needsAttention(message({ is_read: true }))).toBe(true);
  });

  it("releases it once replied or archived", () => {
    expect(
      needsAttention(message({ is_read: true, replied_at: "2026-08-02" })),
    ).toBe(false);
    expect(needsAttention(message({ is_archived: true }))).toBe(false);
  });
});

describe("matchesFilter", () => {
  it("keeps archived out of every view but its own", () => {
    const archived = message({
      is_archived: true,
      is_read: true,
      replied_at: "2026-08-02",
    });
    expect(matchesFilter(archived, "all")).toBe(false);
    expect(matchesFilter(archived, "replied")).toBe(false);
    expect(matchesFilter(archived, "attention")).toBe(false);
    expect(matchesFilter(archived, "archived")).toBe(true);
  });
});

describe("matchesSearch", () => {
  it("matches an empty term", () => {
    expect(matchesSearch(message(), "  ")).toBe(true);
  });

  it("searches name, address, subject and body, case-insensitively", () => {
    expect(matchesSearch(message(), "ADA")).toBe(true);
    expect(matchesSearch(message(), "example.com")).toBe(true);
    expect(matchesSearch(message(), "engine")).toBe(true);
    expect(matchesSearch(message(), "contract")).toBe(true);
    expect(matchesSearch(message(), "babbage")).toBe(false);
  });
});

describe("inboxCounts", () => {
  const messages = [
    message({ id: "a" }),
    message({ id: "b", is_read: true }),
    message({ id: "c", is_read: true, replied_at: "2026-08-02" }),
    message({ id: "d", is_archived: true }),
  ];

  it("counts each view the way its filter defines it", () => {
    const counts = inboxCounts(messages);
    expect(counts.attention).toBe(2);
    expect(counts.all).toBe(3);
    expect(counts.replied).toBe(1);
    expect(counts.archived).toBe(1);
  });

  /** The "mark all read" affordance keys off this; archived must not count. */
  it("does not count an unread archived message as unread", () => {
    const counts = inboxCounts([
      message({ id: "e", is_read: false, is_archived: true }),
    ]);
    expect(counts.unread).toBe(0);
  });
});

describe("visibleMessages", () => {
  const older = message({ id: "old", created_at: "2026-07-01T09:00:00.000Z" });
  const newer = message({ id: "new", created_at: "2026-08-01T09:00:00.000Z" });

  /**
   * Age is the only signal an inbox has about neglect, so leading with the
   * message that has waited longest is a genuinely useful order — which is why
   * it is still offered. It was the wrong thing to *impose* on the default
   * view: opening the inbox showed the oldest message at the top, which is not
   * how any mail client behaves and reads as a bug rather than a policy.
   */
  it("puts the oldest first when asked to", () => {
    const result = visibleMessages([newer, older], "attention", "", "oldest");
    expect(result.map((entry) => entry.id)).toEqual(["old", "new"]);
  });

  it("defaults to newest first, in every view", () => {
    for (const filter of ["attention", "all", "replied", "archived"] as const) {
      const times = visibleMessages([older, newer], filter, "").map((entry) =>
        new Date(entry.created_at).getTime(),
      );
      // Only messages matching the filter survive, so assert that whatever
      // came back is in descending order rather than naming a fixed pair.
      expect(times).toEqual([...times].sort((a, b) => b - a));
    }

    expect(
      visibleMessages([older, newer], "all", "").map((entry) => entry.id),
    ).toEqual(["new", "old"]);
    expect(
      visibleMessages([older, newer], "attention", "").map((entry) => entry.id),
    ).toEqual(["new", "old"]);
  });

  it("applies the filter and the search together", () => {
    const result = visibleMessages(
      [newer, message({ id: "other", name: "Charles" })],
      "attention",
      "charles",
    );
    expect(result.map((entry) => entry.id)).toEqual(["other"]);
  });

  it("does not reorder the array it was given", () => {
    const input = [newer, older];
    visibleMessages(input, "attention", "");
    // RTK Query hands out a frozen cache array in development; sorting in
    // place would throw there and silently reorder the cache in production.
    expect(input.map((entry) => entry.id)).toEqual(["new", "old"]);
  });
});

describe("replyMailto", () => {
  it("quotes the message and prefixes the subject", () => {
    const url = replyMailto(message());
    const parsed = new URL(url);
    const params = new URLSearchParams(parsed.search);

    expect(parsed.protocol).toBe("mailto:");
    expect(decodeURIComponent(parsed.pathname)).toBe("ada@example.com");
    expect(params.get("subject")).toBe("Re: Analytical engine");
    expect(params.get("body")).toContain("> Do you take contract work?");
  });

  it("does not stack Re: prefixes", () => {
    const url = replyMailto(message({ subject: "Re: Already a reply" }));
    expect(new URLSearchParams(new URL(url).search).get("subject")).toBe(
      "Re: Already a reply",
    );
  });

  /** An unescaped `&` in a subject would truncate the URL at that point. */
  it("escapes values that would otherwise break the URL", () => {
    const url = replyMailto(
      message({ subject: "Rates & availability", message: "A?B&C" }),
    );
    const params = new URLSearchParams(new URL(url).search);
    expect(params.get("subject")).toBe("Re: Rates & availability");
    expect(params.get("body")).toContain("A?B&C");
  });
});

describe("isDiscordWebhook", () => {
  it("accepts the real thing", () => {
    expect(
      isDiscordWebhook(
        "https://discord.com/api/webhooks/123456789/abcDEF-ghi_jkl",
      ),
    ).toBe(true);
    expect(
      isDiscordWebhook(
        "https://discord.com/api/v10/webhooks/123456789/abcDEF-ghi_jkl",
      ),
    ).toBe(true);
  });

  /**
   * Parsed rather than regex-matched against the whole string, so a hostile
   * host carrying "discord.com" in its path is rejected on the host.
   */
  it("rejects a lookalike host", () => {
    expect(
      isDiscordWebhook("https://evil.example/discord.com/api/webhooks/1/token"),
    ).toBe(false);
    expect(
      isDiscordWebhook("https://discord.com.evil.example/api/webhooks/1/token"),
    ).toBe(false);
  });

  /** The trigger posts the message body; pg_net would send it in the clear. */
  it("requires https", () => {
    expect(isDiscordWebhook("http://discord.com/api/webhooks/1/token")).toBe(
      false,
    );
  });

  it("rejects anything that is not a webhook path", () => {
    for (const value of [
      "",
      "not a url",
      "https://discord.com",
      "https://discord.com/api/webhooks/",
      "https://discord.com/channels/1/2",
    ]) {
      expect(isDiscordWebhook(value)).toBe(false);
    }
  });
});

describe("inboxTimestamp", () => {
  const now = new Date(2026, 8, 10, 14, 30);

  /**
   * "3 days ago" has to be decoded before it can be compared with the row
   * above it, and a column of relative phrases at different lengths does not
   * scan. Mail clients all write an absolute value in a fixed shape.
   */
  it("shows a time for today", () => {
    const result = inboxTimestamp(
      new Date(2026, 8, 10, 9, 5).toISOString(),
      now,
    );
    expect(result).toMatch(/9[:.]05/);
  });

  it("shows a weekday within the last week", () => {
    const result = inboxTimestamp(
      new Date(2026, 8, 7, 9, 5).toISOString(),
      now,
    );
    expect(result).toMatch(/^[A-Za-z]{3}/);
  });

  it("shows a date beyond a week", () => {
    const result = inboxTimestamp(new Date(2026, 7, 2).toISOString(), now);
    expect(result).toMatch(/2/);
    expect(result).toMatch(/Aug/i);
  });

  it("includes the year for a different one", () => {
    expect(inboxTimestamp(new Date(2024, 7, 2).toISOString(), now)).toMatch(
      /2024/,
    );
  });

  /**
   * Calendar days apart, not elapsed milliseconds. A message from 11pm
   * yesterday is "yesterday" at 1am, not "today" — an elapsed-time check gets
   * that wrong for the two hours it matters most.
   */
  it("counts calendar days, not elapsed hours", () => {
    const lateLastNight = new Date(2026, 8, 9, 23, 30);
    const earlyToday = new Date(2026, 8, 10, 1, 0);
    expect(inboxTimestamp(lateLastNight.toISOString(), earlyToday)).not.toMatch(
      /:/,
    );
  });

  it("returns nothing for an unreadable date", () => {
    expect(inboxTimestamp("not a date", now)).toBe("");
  });
});
