import { supabase } from "@/supabase/client";
import { config } from "@/lib/config";

/**
 * The two things that need a server-side hop, and why.
 *
 * Yahoo Finance answers a server correctly but sends **no `access-control-*`
 * headers**, so a browser refuses the response. Google News' RSS is the same,
 * and Reddit returns 403 to anything that is not a logged-in browser. None of
 * them wants a key — they simply decline cross-origin calls.
 *
 * So these go through the `market-data` edge function, which is a CORS shim
 * and nothing more. No secret passes through it, which is what keeps the
 * project's rule intact: a key in a static export is a published key, and
 * there is no key here to publish.
 *
 * Everything degrades. The function may not be deployed — it ships as source
 * that someone has to run `supabase functions deploy` on — so every call
 * returns null rather than throwing, and each panel says plainly that live
 * data is unavailable. A watchlist without prices is still a watchlist.
 */

const TIMEOUT_MS = 9_000;

/** Whether a hop is even possible. False in static mode, and before deploy. */
export function hasLiveData(): boolean {
  return Boolean(config.supabase.url && supabase);
}

function functionUrl(params: Record<string, string>): string | null {
  const base = config.supabase.url;
  if (!base) return null;
  const query = new URLSearchParams(params).toString();
  return `${base}/functions/v1/market-data?${query}`;
}

async function call<T>(params: Record<string, string>): Promise<T | null> {
  const url = functionUrl(params);
  if (!url) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // The anon key is required by the gateway even on a function deployed
    // with --no-verify-jwt. It is already public by design — it is in every
    // request this app makes — so this adds no exposure.
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;

    const response = await fetch(url, {
      signal: controller.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    clearTimeout(timer);

    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    // Not deployed, offline, blocked, or timed out. All the same here.
    return null;
  }
}

/* ── Quotes ──────────────────────────────────────────────────────────────── */

export interface Quote {
  symbol: string;
  name: string | null;
  price: number | null;
  previousClose: number | null;
  currency: string | null;
  changePercent: number | null;
}

/**
 * Prices for a set of symbols, keyed by symbol.
 *
 * A map rather than a list, because the caller has rows to match them against
 * and some of those rows have no symbol at all.
 */
export async function fetchQuotes(
  symbols: string[],
): Promise<Map<string, Quote>> {
  const wanted = symbols
    .map((symbol) => symbol.trim())
    .filter(Boolean)
    // The function caps at twelve; asking for more would silently drop the
    // tail, and a watchlist that shows prices for the first twelve rows and
    // blanks for the rest looks broken rather than limited.
    .slice(0, 12);

  if (wanted.length === 0) return new Map();

  const body = await call<{ quotes?: Quote[] }>({
    kind: "quote",
    symbols: wanted.join(","),
  });

  const map = new Map<string, Quote>();
  for (const quote of body?.quotes ?? []) {
    if (quote && typeof quote.symbol === "string") {
      map.set(quote.symbol.toUpperCase(), quote);
    }
  }
  return map;
}

/* ── News ────────────────────────────────────────────────────────────────── */

export const NEWS_TOPICS = [
  { id: "top", label: "Top" },
  { id: "world", label: "World" },
  { id: "business", label: "Business" },
  { id: "technology", label: "Technology" },
  { id: "science", label: "Science" },
  { id: "health", label: "Health" },
  { id: "sports", label: "Sport" },
  { id: "entertainment", label: "Culture" },
] as const;

export type NewsTopic = (typeof NEWS_TOPICS)[number]["id"];

export interface Article {
  title: string;
  url: string;
  source: string | null;
  publishedAt: string | null;
}

export async function fetchNews(
  topic: NewsTopic,
  query = "",
  limit = 8,
): Promise<Article[] | null> {
  const body = await call<{ articles?: Article[] }>({
    kind: "news",
    topic,
    ...(query.trim() ? { q: query.trim() } : {}),
    limit: String(limit),
  });

  if (!body?.articles) return null;

  return body.articles.filter(
    (article): article is Article =>
      typeof article?.title === "string" && typeof article?.url === "string",
  );
}

/**
 * Google News appends " - Publisher" to most headlines, and the publisher is
 * already shown separately. Trimming it stops every line ending in a repeat of
 * the label beside it.
 */
export function cleanHeadline(title: string, source: string | null): string {
  if (!source) return title;
  const suffix = ` - ${source}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;
}
