/**
 * The outside world, read from the browser.
 *
 * Every service here needs **no API key**, and that is a hard constraint
 * rather than a preference. This app is a static export with no server, so a
 * key would have to travel as `NEXT_PUBLIC_*` — which Next.js compiles into
 * the JavaScript bundle, readable by anyone who opens the page. A key in a
 * static site is a published key. That rules out NewsAPI, OpenWeather and most
 * of the obvious choices, and it is why these four were picked:
 *
 * - **Open-Meteo** — forecasts, no key, `access-control-allow-origin: *`.
 * - **Hacker News** via Algolia — story search, no key, CORS reflected.
 * - **dev.to** — articles by tag, no key, `*`.
 * - **Wikipedia** — on this day, no key, `*`.
 *
 * The second constraint is that all of it is optional. These are third-party
 * services on someone else's uptime, reached over a connection that may be
 * behind an ad-blocker — the visit tracker already learned that lesson. So
 * every call here resolves rather than throws, and the UI shows what it has.
 * A failed forecast is a quiet gap, never a broken page.
 */

/** Long enough for a slow connection, short enough not to hang the panel. */
const TIMEOUT_MS = 8_000;

/**
 * Fetch and parse JSON, or return null.
 *
 * Never throws. A rejected promise here would take down a panel over a service
 * being briefly unavailable, which is not a failure worth a stack trace.
 */
export async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    // Offline, blocked, timed out, or malformed. All the same to the caller.
    return null;
  }
}

// ── Weather ─────────────────────────────────────────────────────────────────

export interface Forecast {
  temperature: number;
  /** Open-Meteo's WMO weather code. */
  code: number;
  high: number;
  low: number;
  /** Local time at the place, not the viewer — "is it night there" matters. */
  isDay: boolean;
}

export function weatherUrl(
  latitude: number,
  longitude: number,
  timezone?: string | null,
): string {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,weather_code,is_day",
    daily: "temperature_2m_max,temperature_2m_min",
    forecast_days: "1",
    // `auto` resolves the zone from the coordinates, which is right far more
    // often than the viewer's own zone would be.
    timezone: timezone || "auto",
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    is_day?: number;
  };
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
}

/**
 * Read a forecast, or null.
 *
 * Every field is checked rather than trusted: a response that arrives without
 * a temperature is not a zero-degree day.
 */
export function parseForecast(body: unknown): Forecast | null {
  if (typeof body !== "object" || body === null) return null;

  const data = body as OpenMeteoResponse;
  const temperature = data.current?.temperature_2m;
  if (typeof temperature !== "number" || !Number.isFinite(temperature)) {
    return null;
  }

  const high = data.daily?.temperature_2m_max?.[0];
  const low = data.daily?.temperature_2m_min?.[0];

  return {
    temperature,
    code:
      typeof data.current?.weather_code === "number"
        ? data.current.weather_code
        : 0,
    // Falling back to the current temperature rather than 0 keeps a partial
    // response readable instead of claiming a freezing high.
    high: typeof high === "number" ? high : temperature,
    low: typeof low === "number" ? low : temperature,
    isDay: data.current?.is_day !== 0,
  };
}

/**
 * WMO weather codes, grouped.
 *
 * The full table has 28 entries that split hairs a person does not care
 * about — "light drizzle" versus "moderate drizzle" is the same coat.
 */
export function describeWeather(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code <= 48) return "Fog";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow showers";
  return "Thunderstorm";
}

// ── Topics ──────────────────────────────────────────────────────────────────

export type TopicSource = "hackernews" | "devto";

export interface Story {
  id: string;
  title: string;
  url: string;
  /** Points, reactions — whatever the source counts. Absent when it counts none. */
  score?: number;
  host?: string;
}

export function topicUrl(term: string, source: TopicSource): string {
  // Encoded, not interpolated: a term with an ampersand would otherwise
  // truncate the query and silently search for something else.
  const query = encodeURIComponent(term.trim());

  return source === "hackernews"
    ? `https://hn.algolia.com/api/v1/search?query=${query}&tags=story&hitsPerPage=6`
    : `https://dev.to/api/articles?tag=${query}&per_page=6`;
}

/** The host, for a "where is this from" label. Never throws on a bad URL. */
export function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export function parseStories(body: unknown, source: TopicSource): Story[] {
  const rows =
    source === "hackernews"
      ? (body as { hits?: unknown[] } | null)?.hits
      : body;

  if (!Array.isArray(rows)) return [];

  return rows
    .map((row): Story | null => {
      if (typeof row !== "object" || row === null) return null;
      const record = row as Record<string, unknown>;

      const title = typeof record.title === "string" ? record.title.trim() : "";
      if (!title) return null;

      // Hacker News returns `url: null` for text-only posts; the discussion
      // page is then the only place to send someone.
      const url =
        typeof record.url === "string" && record.url
          ? record.url
          : source === "hackernews" && record.objectID
            ? `https://news.ycombinator.com/item?id=${String(record.objectID)}`
            : "";
      if (!url) return null;

      const score =
        source === "hackernews"
          ? record.points
          : record.positive_reactions_count;

      return {
        id: String(record.objectID ?? record.id ?? url),
        title,
        url,
        score: typeof score === "number" ? score : undefined,
        host: hostOf(url),
      };
    })
    .filter((story): story is Story => story !== null);
}

// ── On this day ─────────────────────────────────────────────────────────────

export interface HistoricEvent {
  year: number;
  text: string;
}

export function onThisDayUrl(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  // Built from local calendar fields: an ISO string would ask for yesterday's
  // events for part of every day.
  return `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${month}/${day}`;
}

export function parseHistoricEvents(body: unknown, limit = 3): HistoricEvent[] {
  const events = (body as { events?: unknown[] } | null)?.events;
  if (!Array.isArray(events)) return [];

  return events
    .map((row): HistoricEvent | null => {
      if (typeof row !== "object" || row === null) return null;
      const record = row as Record<string, unknown>;
      const year = record.year;
      const text = record.text;
      if (typeof year !== "number" || typeof text !== "string") return null;
      return { year, text: text.trim() };
    })
    .filter((event): event is HistoricEvent => event !== null)
    .sort((a, b) => b.year - a.year)
    .slice(0, limit);
}
