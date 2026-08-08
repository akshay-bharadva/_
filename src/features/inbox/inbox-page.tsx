"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bell, CheckCheck, Inbox as InboxIcon } from "lucide-react";
import {
  useDeleteContactSubmissionMutation,
  useGetContactSubmissionsQuery,
  useUpdateContactSubmissionMutation,
  useUpdateContactSubmissionsMutation,
} from "@/store/api/adminApi";
import type { ContactSubmission } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  EmptyState,
  LoadingState,
  ManagerWrapper,
  PageHeader,
} from "@/components/admin/shared";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/cn";
import { useBelowBreakpoint } from "@/hooks/use-media-query";
import {
  INBOX_FILTERS,
  inboxCounts,
  visibleMessages,
  type InboxFilter,
} from "./inbox-filters";
import { MessageList } from "./message-list";
import { MessageDetail } from "./message-detail";
import { NotificationSettings } from "./notification-settings";

/**
 * The contact inbox.
 *
 * `contact_submissions` existed from the first schema with admin read and
 * delete policies and no interface, so every message the site ever received
 * landed somewhere nobody looked. This is that interface: list on the left,
 * message on the right, and the four states derived in `inbox-filters.ts` so
 * the badge, the tabs and the ordering cannot disagree.
 */
export default function InboxPage() {
  const { data: messages = [], isLoading } = useGetContactSubmissionsQuery();
  const [updateMessage, { isLoading: isUpdating }] =
    useUpdateContactSubmissionMutation();
  const [updateMany] = useUpdateContactSubmissionsMutation();
  const [deleteMessage] = useDeleteContactSubmissionMutation();

  const [filter, setFilter] = useState<InboxFilter>("attention");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const narrow = useBelowBreakpoint("lg");

  const counts = useMemo(() => inboxCounts(messages), [messages]);
  const visible = useMemo(
    () => visibleMessages(messages, filter, search),
    [messages, filter, search],
  );

  const selected = useMemo(
    () => messages.find((message) => message.id === selectedId) ?? null,
    [messages, selectedId],
  );

  /**
   * Keep a selection that still exists in the current view.
   *
   * Archiving the open message, or switching filters, would otherwise leave the
   * detail pane showing a message the list no longer contains.
   */
  useEffect(() => {
    if (visible.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!visible.some((message) => message.id === selectedId)) {
      setSelectedId(visible[0].id);
    }
  }, [visible, selectedId]);

  /**
   * Opening a message marks it read — but read is not replied, so it stays in
   * the attention view. An inbox that empties itself when you glance at
   * something is how enquiries get lost.
   */
  useEffect(() => {
    if (selected && !selected.is_read) {
      void updateMessage({ id: selected.id, is_read: true });
    }
  }, [selected, updateMessage]);

  const patch = async (changes: Partial<ContactSubmission>) => {
    if (!selected) return;
    try {
      await updateMessage({ id: selected.id, ...changes }).unwrap();
    } catch (error) {
      toast.error("Could not update the message", {
        description: getErrorMessage(error),
      });
    }
  };

  const remove = async () => {
    if (!selected) return;
    try {
      await deleteMessage(selected.id).unwrap();
      toast.success("Message deleted");
    } catch (error) {
      toast.error("Could not delete the message", {
        description: getErrorMessage(error),
      });
    }
  };

  const markAllRead = async () => {
    const ids = messages
      .filter((message) => !message.is_read && !message.is_archived)
      .map((message) => message.id);
    if (ids.length === 0) return;
    try {
      await updateMany({ ids, changes: { is_read: true } }).unwrap();
      toast.success(`Marked ${ids.length} read`);
    } catch (error) {
      toast.error("Could not mark them read", {
        description: getErrorMessage(error),
      });
    }
  };

  const emptyFor =
    INBOX_FILTERS.find((entry) => entry.id === filter)?.empty ??
    "Nothing here.";

  if (isLoading)
    return <LoadingState variant="page" label="Loading messages" />;

  return (
    <ManagerWrapper>
      <PageHeader
        title="Inbox"
        description="Messages from the contact form."
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Search name, address or message…"
        actions={
          <div className="flex items-center gap-2">
            {counts.unread > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={markAllRead}
              >
                <CheckCheck className="mr-1.5 size-3.5" />
                Mark all read
              </Button>
            )}
            <Sheet>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <Bell className="mr-1.5 size-3.5" />
                  Notifications
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Notifications</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <NotificationSettings />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        }
        filters={
          <div
            role="tablist"
            aria-label="Filter messages"
            className="flex flex-wrap gap-1.5"
          >
            {INBOX_FILTERS.map((entry) => {
              const active = entry.id === filter;
              const count = counts[entry.id];
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(entry.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-xs font-medium transition-[box-shadow,color] duration-200 ease-enter",
                    active
                      ? "bg-card text-foreground shadow-e2"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {entry.label}
                  <span
                    className={cn(
                      "tabular-nums",
                      active ? "text-primary" : "text-muted-foreground/70",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        }
      />

      {messages.length === 0 ? (
        <EmptyState
          icon={InboxIcon}
          title="No messages yet"
          description="Anything sent through the contact form arrives here. Set up a Discord ping from Notifications so you hear about it when it does."
        />
      ) : (
        <div className="mt-6 grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)] xl:grid-cols-[26rem_minmax(0,1fr)]">
          <div className="min-w-0">
            <MessageList
              messages={visible}
              selectedId={selectedId}
              onSelect={(message) => setSelectedId(message.id)}
              emptyMessage={emptyFor}
            />
          </div>

          <div className="hidden min-w-0 lg:block lg:sticky lg:top-24 lg:h-[calc(100vh-12rem)]">
            {selected ? (
              <MessageDetail
                message={selected}
                onUpdate={(changes) => void patch(changes)}
                onDelete={() => void remove()}
                busy={isUpdating}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-surface bg-card p-8 text-center shadow-e1">
                <p className="text-sm text-muted-foreground">
                  Select a message to read it.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/*
        Below `lg` the two panes cannot sit side by side, so the detail becomes
        a sheet over the list rather than a second screen with its own back
        button and its own copy of the actions.

        Gated on a measured media query, not `lg:hidden`: a Radix sheet hidden
        by a class still mounts, still renders its overlay and still traps
        focus, so on a wide screen it would swallow every click on the list
        behind it.
      */}
      {narrow && (
        <Sheet
          open={Boolean(selected)}
          onOpenChange={(open) => {
            if (!open) setSelectedId(null);
          }}
        >
          <SheetContent
            side="bottom"
            className="flex h-[85vh] flex-col"
            aria-label="Message"
          >
            {selected && (
              <div className="mt-4 min-h-0 flex-1">
                <MessageDetail
                  message={selected}
                  onUpdate={(changes) => void patch(changes)}
                  onDelete={() => void remove()}
                  busy={isUpdating}
                />
              </div>
            )}
          </SheetContent>
        </Sheet>
      )}
    </ManagerWrapper>
  );
}
