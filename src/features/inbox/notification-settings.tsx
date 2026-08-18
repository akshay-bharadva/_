"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import {
  useGetIntegrationSettingsQuery,
  useUpdateIntegrationSettingsMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/utils";
import { isDiscordWebhook } from "./inbox-notifications";

/**
 * Where the Discord webhook lives now.
 *
 * It used to be `NEXT_PUBLIC_CONTACT_WEBHOOK_URL`, which Next.js compiles into
 * the client bundle — so the URL was readable by anyone who opened the site's
 * JavaScript, and a Discord webhook URL is a complete authorisation to post
 * whatever you like into that channel. It is now a column on
 * `integration_settings`, which has no public read policy at all; the ping is
 * sent by an AFTER INSERT trigger through `pg_net`.
 *
 * This panel is in Inbox rather than Settings deliberately. Settings is bound
 * to the `site_identity` row and its per-group save machinery, and this is a
 * different table with a different security posture — putting it there would
 * mean either bending that machinery or quietly widening what Settings writes.
 */
export function NotificationSettings() {
  const { data: settings, isLoading } = useGetIntegrationSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] =
    useUpdateIntegrationSettingsMutation();

  const [url, setUrl] = useState("");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!settings) return;
    setUrl(settings.contact_webhook_url ?? "");
    setEnabled(settings.notify_on_contact);
  }, [settings]);

  const trimmed = url.trim();
  const invalid = trimmed !== "" && !isDiscordWebhook(trimmed);
  const dirty =
    trimmed !== (settings?.contact_webhook_url ?? "") ||
    enabled !== (settings?.notify_on_contact ?? true);

  const save = async () => {
    if (invalid) return;
    try {
      await updateSettings({
        contact_webhook_url: trimmed === "" ? null : trimmed,
        notify_on_contact: enabled,
      }).unwrap();
      toast.success("Notification settings saved");
    } catch (error) {
      toast.error("Could not save notification settings", {
        description: getErrorMessage(error),
      });
    }
  };

  if (isLoading) return null;

  return (
    <div className="space-y-4 rounded-surface bg-card p-5 shadow-e1">
      <div className="flex items-start gap-3">
        <ShieldCheck
          className="mt-0.5 size-4 shrink-0 text-chart-2"
          aria-hidden
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Stored in an admin-only table and sent by the database when a message
          arrives, so the URL never reaches the public site. Requires migration{" "}
          <code className="font-mono">007-contact-inbox.sql</code>.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contact-webhook">Discord webhook URL</Label>
        <Input
          id="contact-webhook"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://discord.com/api/webhooks/…"
          aria-invalid={invalid}
          // A webhook URL is a credential. Nothing here needs it visible, and
          // this screen gets opened wherever the owner happens to be.
          type="password"
          autoComplete="off"
        />
        {invalid && (
          <p role="alert" className="text-xs text-destructive">
            That is not a Discord webhook URL. Copy it from Channel settings →
            Integrations → Webhooks.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-6">
        <div className="space-y-0.5">
          <Label htmlFor="notify-toggle" className="cursor-pointer">
            Notify on new messages
          </Label>
          <p className="text-xs text-muted-foreground">
            Messages are still saved here when this is off.
          </p>
        </div>
        <Switch
          id="notify-toggle"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>

      <Button
        type="button"
        size="sm"
        onClick={save}
        disabled={!dirty || invalid || isSaving}
      >
        {isSaving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
        Save
      </Button>
    </div>
  );
}
