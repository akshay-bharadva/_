"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, MapPin, Plus, Trash2 } from "lucide-react";
import type {
  DiscoverPlace,
  DiscoverTopic,
  IntegrationSettings,
} from "@/types";
import {
  useDeleteDiscoverPlaceMutation,
  useDeleteDiscoverTopicMutation,
  useGetDiscoverPlacesQuery,
  useGetDiscoverTopicsQuery,
  useGetIntegrationSettingsQuery,
  useSaveDiscoverPlaceMutation,
  useSaveDiscoverTopicMutation,
  useGetFinSettingsQuery,
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
  parseForecast,
  parseStories,
  topicUrl,
  weatherUrl,
  WINDOWS,
  type Forecast,
  type Story,
  type Window,
} from "./sources";
import { MostRead, NewRepos, TopStories } from "./digest";
import { CorridorPanel, CryptoPanel, EconomyPanel } from "./market-panels";
import { Headlines } from "./headlines";
import { CareerPanel } from "./career-panel";
import { ReadingPanel } from "./reading-panel";
import { WatchlistPanel } from "./watchlist-panel";

/**
 * Discover — the parts of the day this app does not own.
 *
 * Everything here comes from a service that needs **no API key**, which is a
 * constraint the architecture imposes rather than a preference: this is a
 * static export with no server, so a key would be compiled into the bundle and
 * published with it. See `sources.ts`.
 *
 * The question it answers is "what happened while I was not looking", over the
 * window you pick. The ranking is the answer: most-discussed by score,
 * most-read by actual readership, most-starred by stars. A chronological feed
 * would be the same information with the judgement removed.
 *
 * Weather sits beside it rather than in it. Two places matter when you live
 * away from family, and whether it is dark there is what decides if you call —
 * but it is not news, so it does not compete with the digest for the column
 * that carries weight.
 *
 * Nothing fetched is stored. The rows behind this are only *what to ask for*.
 */
const LANES = [
  { id: "money", label: "Money & markets" },
  { id: "career", label: "Career" },
  { id: "reading", label: "Worth reading" },
  { id: "world", label: "What happened" },
] as const;

type Lane = (typeof LANES)[number]["id"];

export default function DiscoverPage() {
  const { data: places = [] } = useGetDiscoverPlacesQuery();
  const { data: topics = [] } = useGetDiscoverTopicsQuery();
  const { data: finance } = useGetFinSettingsQuery();
  const { data: integrations } = useGetIntegrationSettingsQuery();

  const [lane, setLane] = useState<Lane>("money");
  const [window, setWindow] = useState<Window>("day");

  /*
    The corridor comes from Finance, which already knows where money is earned
    and where it is sent — `home_currency` exists there precisely for this.
    Asking again here would be a second answer to a settled question, and the
    two would drift.
  */
  const base = finance?.base_currency ?? "CAD";
  const home = finance?.home_currency ?? null;

  return (
    <div className="space-y-5 pb-10">
      {/*
        The header and the lane switch are stacked, not sat side by side.

        They were siblings in a `flex flex-wrap` row, and `PageHeader` is a
        plain `div` with no `min-w-0` — so inside a flex parent its default
        `min-width: auto` let a long description claim the whole basis and
        squeeze the switch beside it. With two lanes that was survivable; at
        four it breaks, which is what was reported.

        Stacking also gives the switch the full width it needs. Four labels is
        more than fits beside a heading on a laptop, let alone a phone.
      */}
      <PageHeader
        title="Discover"
        description="Markets, the job market, and what happened while you were not looking."
      />

      {/*
        A segmented control that scrolls sideways rather than wrapping.

        A wrapped row of tabs changes the header's height as the selection
        moves, which shifts the whole page under the pointer. Scrolling keeps
        the control one row at every width — the same reason the editor toolbar
        stopped wrapping.
      */}
      <div
        role="tablist"
        aria-label="Section"
        className="no-scrollbar -mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1"
      >
        {LANES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={option.id === lane}
            onClick={() => setLane(option.id)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-control px-3 py-1.5 text-xs font-medium transition-[box-shadow,color] duration-200 ease-enter",
              option.id === lane
                ? "bg-card text-foreground shadow-e2"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {lane === "money" && (
        <MoneyLane
          base={base}
          home={home}
          places={places}
          integrations={integrations}
        />
      )}

      {lane === "career" && <CareerLane />}

      {/*
        A lane of its own rather than a panel inside "What happened".
        
        Those two answer different questions: one is "what occurred", the other
        is "what is worth an hour of my attention". Ranking by engagement is
        the second question, and burying it under the first is how it stops
        being asked.
      */}
      {lane === "reading" && <ReadingPanel />}

      {lane === "world" && (
        <WorldLane topics={topics} window={window} onWindow={setWindow} />
      )}
    </div>
  );
}

/* ── Money lane ──────────────────────────────────────────────────────────── */

function MoneyLane({
  base,
  home,
  places,
  integrations,
}: {
  base: string;
  home: string | null;
  places: DiscoverPlace[];
  integrations?: IntegrationSettings;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {home ? (
          <CorridorPanel base={base} quote={home} />
        ) : (
          <section className="rounded-surface bg-card p-4 shadow-e1">
            <h2 className="text-sm font-semibold text-foreground">
              Currency corridor
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Set a home currency in Finance and the rate you send at shows
              here, against its own last month.
            </p>
          </section>
        )}

        <CryptoPanel />
        <EconomyPanel country="CA" />
      </div>

      {/*
        The watchlist replaces the standing apology about indices. The
        constraint is the same and still true, but it is now stated *inside*
        the feature it limits — where the reader can act on it — rather than as
        a paragraph explaining why there is no feature.
      */}
      <WatchlistPanel
        baseCurrency={base}
        provider={integrations?.market_data_provider ?? null}
        apiKey={integrations?.market_data_key ?? null}
      />

      <section className="space-y-3" aria-label="Weather">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {places.map((place) => (
            <WeatherCard key={place.id} place={place} />
          ))}
          <AddPlace />
        </div>
      </section>
    </div>
  );
}

/* ── Career lane ─────────────────────────────────────────────────────────── */

function CareerLane() {
  return <CareerPanel />;
}

/* ── World lane ──────────────────────────────────────────────────────────── */

function WorldLane({
  topics,
  window,
  onWindow,
}: {
  topics: DiscoverTopic[];
  window: Window;
  onWindow: (next: Window) => void;
}) {
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Time window" className="flex gap-1">
        {WINDOWS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={option.id === window}
            onClick={() => onWindow(option.id)}
            className={cn(
              "rounded-control px-3 py-1.5 text-xs font-medium transition-[box-shadow,color] duration-200 ease-enter",
              option.id === window
                ? "bg-card text-foreground shadow-e2"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Headlines />
          <TopStories window={window} />
          <NewRepos window={window} />

          <section className="space-y-3" aria-label="Following">
            {topics.map((topic) => (
              <TopicPanel key={topic.id} topic={topic} window={window} />
            ))}
            <AddTopic count={topics.length} />
          </section>
        </div>

        <MostRead />
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

function TopicPanel({
  topic,
  window,
}: {
  topic: DiscoverTopic;
  window: Window;
}) {
  const [stories, setStories] = useState<Story[]>([]);
  const [state, setState] = useState<"loading" | "done" | "failed">("loading");
  const [deleteTopic] = useDeleteDiscoverTopicMutation();
  const confirm = useConfirm();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const body = await fetchJson(topicUrl(topic.term, topic.source, window));
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
  }, [topic.term, topic.source, window]);

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
