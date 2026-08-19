"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CloudSun,
  ExternalLink,
  History,
  MapPin,
  Plus,
  Trash2,
} from "lucide-react";
import type { DiscoverPlace, DiscoverTopic } from "@/types";
import {
  useDeleteDiscoverPlaceMutation,
  useDeleteDiscoverTopicMutation,
  useGetDiscoverPlacesQuery,
  useGetDiscoverTopicsQuery,
  useSaveDiscoverPlaceMutation,
  useSaveDiscoverTopicMutation,
} from "@/store/api/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/admin/shared";
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { discoverPlaceSchema, discoverTopicSchema } from "@/lib/schemas";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/cn";
import {
  describeWeather,
  fetchJson,
  onThisDayUrl,
  parseForecast,
  parseHistoricEvents,
  parseStories,
  topicUrl,
  weatherUrl,
  type Forecast,
  type HistoricEvent,
  type Story,
} from "./sources";

/**
 * Discover — the parts of the day this app does not own.
 *
 * Everything here comes from a service that needs **no API key**, which is a
 * constraint the architecture imposes rather than a preference: this is a
 * static export with no server, so a key would be compiled into the bundle and
 * published with it. See `sources.ts`.
 *
 * The weather panel is the reason the module exists. Living away from family
 * means two places matter, and "is it a reasonable hour to call, and what is
 * it like there" is a question this app was already half-answering with the
 * calendar's home timezone.
 *
 * Nothing here is stored. The rows behind it are only *what to ask for*.
 */
export default function DiscoverPage() {
  const { data: places = [] } = useGetDiscoverPlacesQuery();
  const { data: topics = [] } = useGetDiscoverTopicsQuery();

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Discover"
        description="Weather where you are and where they are, and what is being said about the things you follow."
      />

      <section className="space-y-3" aria-label="Weather">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {places.map((place) => (
            <WeatherCard key={place.id} place={place} />
          ))}
          <AddPlace />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="space-y-3" aria-label="Topics">
          {topics.length === 0 ? (
            <p className="rounded-surface bg-card p-5 text-sm text-muted-foreground shadow-e1">
              Follow a topic and what is being written about it shows up here.
            </p>
          ) : (
            topics.map((topic) => <TopicPanel key={topic.id} topic={topic} />)
          )}
          <AddTopic count={topics.length} />
        </section>

        <OnThisDay />
      </div>
    </div>
  );
}

/* ── Weather ─────────────────────────────────────────────────────────────── */

function WeatherCard({ place }: { place: DiscoverPlace }) {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [state, setState] = useState<"loading" | "done" | "failed">("loading");
  const [deletePlace] = useDeleteDiscoverPlaceMutation();
  const confirm = useConfirm();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const body = await fetchJson(
        weatherUrl(place.latitude, place.longitude, place.timezone),
      );
      if (cancelled) return;

      const parsed = parseForecast(body);
      setForecast(parsed);
      // A failed lookup is a normal path — the service may be down, or an
      // ad-blocker may have eaten the request. It is reported, not thrown.
      setState(parsed ? "done" : "failed");
    })();

    return () => {
      cancelled = true;
    };
  }, [place.latitude, place.longitude, place.timezone]);

  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${place.label}?`,
      description: "Only the place goes; nothing else is affected.",
      confirmText: "Remove",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await deletePlace(place.id).unwrap();
      toast.success("Place removed");
    } catch (error) {
      toast.error("Could not remove it", {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <article className="group relative rounded-surface bg-card p-4 shadow-e1">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate break-words">{place.label}</span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${place.label}`}
          className="size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
          onClick={() => void remove()}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {state === "loading" && (
        <p className="mt-3 text-sm text-muted-foreground">Checking…</p>
      )}

      {state === "failed" && (
        <p className="mt-3 text-sm text-muted-foreground">
          No forecast right now.
        </p>
      )}

      {forecast && (
        <div className="mt-2">
          <p className="text-3xl font-semibold tabular-nums text-foreground">
            {Math.round(forecast.temperature)}°
          </p>
          <p className="mt-0.5 text-sm text-foreground">
            {describeWeather(forecast.code)}
          </p>
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            {Math.round(forecast.high)}° / {Math.round(forecast.low)}°
            {/* Whether it is dark there is the part that decides if you call. */}
            <span className="ml-2">{forecast.isDay ? "Daytime" : "Night"}</span>
          </p>
        </div>
      )}
    </article>
  );
}

function AddPlace() {
  const [savePlace, { isLoading }] = useSaveDiscoverPlaceMutation();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const submit = async () => {
    const draft = {
      label: label.trim(),
      latitude: Number(latitude),
      longitude: Number(longitude),
    };

    // Checked before the write: the columns bound the label at 80 and the
    // coordinates to real ranges, and a typo would otherwise fail at Postgres
    // with nothing to say which field was wrong.
    const checked = discoverPlaceSchema.safeParse(draft);
    if (!checked.success) {
      toast.error("Check the place", {
        description: checked.error.errors[0]?.message,
      });
      return;
    }

    try {
      await savePlace(draft).unwrap();
      setLabel("");
      setLatitude("");
      setLongitude("");
      setOpen(false);
      toast.success("Place added");
    } catch (error) {
      toast.error("Could not add it", {
        description: getErrorMessage(error),
      });
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-32 items-center justify-center gap-2 rounded-surface bg-secondary/40 text-sm text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
      >
        <Plus className="size-4" aria-hidden />
        Add a place
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-surface bg-card p-4 shadow-e1">
      <div className="space-y-1">
        <Label htmlFor="place-label" className="text-xs">
          Name
        </Label>
        <Input
          id="place-label"
          value={label}
          maxLength={80}
          placeholder="Home"
          onChange={(event) => setLabel(event.target.value)}
          className="h-8 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="place-lat" className="text-xs">
            Latitude
          </Label>
          <Input
            id="place-lat"
            value={latitude}
            inputMode="decimal"
            placeholder="19.0760"
            onChange={(event) => setLatitude(event.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="place-lon" className="text-xs">
            Longitude
          </Label>
          <Input
            id="place-lon"
            value={longitude}
            inputMode="decimal"
            placeholder="72.8777"
            onChange={(event) => setLongitude(event.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={isLoading}
          onClick={() => void submit()}
        >
          Add
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ── Topics ──────────────────────────────────────────────────────────────── */

const SOURCE_LABEL: Record<DiscoverTopic["source"], string> = {
  hackernews: "Hacker News",
  devto: "dev.to",
};

function TopicPanel({ topic }: { topic: DiscoverTopic }) {
  const [stories, setStories] = useState<Story[]>([]);
  const [state, setState] = useState<"loading" | "done" | "failed">("loading");
  const [deleteTopic] = useDeleteDiscoverTopicMutation();
  const confirm = useConfirm();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const body = await fetchJson(topicUrl(topic.term, topic.source));
      if (cancelled) return;

      if (body === null) {
        setState("failed");
        return;
      }
      setStories(parseStories(body, topic.source));
      setState("done");
    })();

    return () => {
      cancelled = true;
    };
  }, [topic.term, topic.source]);

  const remove = async () => {
    const ok = await confirm({
      title: `Stop following “${topic.term}”?`,
      description: "Nothing else changes.",
      confirmText: "Remove",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await deleteTopic(topic.id).unwrap();
      toast.success("Topic removed");
    } catch (error) {
      toast.error("Could not remove it", {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <section className="group overflow-hidden rounded-surface bg-card shadow-e1">
      <header className="flex items-center justify-between gap-2 px-5 pb-2 pt-4">
        <div className="min-w-0">
          <h2 className="truncate break-words text-sm font-semibold text-foreground">
            {topic.term}
          </h2>
          <p className="text-xs text-muted-foreground">
            {SOURCE_LABEL[topic.source]}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Stop following ${topic.term}`}
          className="size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
          onClick={() => void remove()}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </header>

      {state === "loading" && (
        <p className="px-5 pb-4 text-sm text-muted-foreground">Reading…</p>
      )}

      {state === "failed" && (
        <p className="px-5 pb-4 text-sm text-muted-foreground">
          {SOURCE_LABEL[topic.source]} did not answer. It may be down, or the
          request may have been blocked.
        </p>
      )}

      {state === "done" && stories.length === 0 && (
        <p className="px-5 pb-4 text-sm text-muted-foreground">
          Nothing recent on this one.
        </p>
      )}

      <ul>
        {stories.map((story) => (
          <li key={story.id}>
            <a
              href={story.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-baseline gap-3 border-t border-border/60 px-5 py-2.5 transition-colors hover:bg-secondary/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate break-words text-sm text-foreground">
                  {story.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {story.host}
                  {typeof story.score === "number" && ` · ${story.score}`}
                </span>
              </span>
              <ExternalLink
                className="size-3 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AddTopic({ count }: { count: number }) {
  const [saveTopic, { isLoading }] = useSaveDiscoverTopicMutation();
  const [term, setTerm] = useState("");
  const [source, setSource] = useState<DiscoverTopic["source"]>("hackernews");

  const submit = async () => {
    const draft = {
      term: term.trim(),
      source,
      sort_order: count * 10,
    };

    const checked = discoverTopicSchema.safeParse(draft);
    if (!checked.success) {
      toast.error("Check the topic", {
        description: checked.error.errors[0]?.message,
      });
      return;
    }

    try {
      await saveTopic(draft).unwrap();
      setTerm("");
      toast.success("Following it");
    } catch (error) {
      toast.error("Could not follow it", {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <div className="flex flex-wrap gap-2 rounded-surface bg-card p-3 shadow-e1">
      <Input
        value={term}
        maxLength={80}
        placeholder="Follow a topic — postgres, rust, design…"
        onChange={(event) => setTerm(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void submit();
        }}
        className="h-8 min-w-40 flex-1 text-sm"
      />
      <Select
        value={source}
        onValueChange={(next) => setSource(next as DiscoverTopic["source"])}
      >
        <SelectTrigger className="h-8 w-36 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="hackernews">Hacker News</SelectItem>
          <SelectItem value="devto">dev.to</SelectItem>
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        className="h-8"
        disabled={!term.trim() || isLoading}
        onClick={() => void submit()}
      >
        Follow
      </Button>
    </div>
  );
}

/* ── On this day ─────────────────────────────────────────────────────────── */

function OnThisDay() {
  const [events, setEvents] = useState<HistoricEvent[]>([]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const body = await fetchJson(onThisDayUrl());
      if (!cancelled) setEvents(parseHistoricEvents(body, 4));
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Silent when it has nothing: this is the smallest thing on the page, and an
  // error message for it would be louder than the panel itself.
  if (events.length === 0) return null;

  return (
    <aside
      className="h-fit rounded-surface bg-card p-5 shadow-e1"
      aria-label="On this day"
    >
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <History className="size-3.5 text-muted-foreground" aria-hidden />
        On this day
      </h2>
      <ul className="mt-3 space-y-3">
        {events.map((event) => (
          <li key={`${event.year}-${event.text.slice(0, 24)}`}>
            <p className="text-xs tabular-nums text-muted-foreground">
              {event.year}
            </p>
            <p className={cn("text-sm text-foreground", "break-words")}>
              {event.text}
            </p>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** Kept for the nav icon, so the module and its entry cannot drift. */
export const DISCOVER_ICON = CloudSun;
