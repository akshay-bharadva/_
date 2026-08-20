/**
 * market-data — a CORS shim for two sources a browser cannot reach.
 *
 * This exists because of a precise, testable fact rather than a preference.
 * Yahoo Finance answers a server perfectly well (RY.TO returns Royal Bank of
 * Canada at a real price) but sends **no `access-control-*` headers at all**,
 * so a browser refuses the response. Google News' RSS is the same. Reddit
 * returns 403 to anything that is not a logged-in browser.
 *
 * Note what this is *not*: a key vault. Neither source needs an API key. The
 * only thing missing is a CORS header, and one small server-side hop supplies
 * it. That matters for this codebase, where the rule has been that a key in a
 * static export is a published key — nothing secret passes through here, so
 * that rule is not being bent.
 *
 * The site stays a static export. This runs beside the database that was
 * already server-side.
 *
 *   supabase functions deploy market-data --no-verify-jwt
 *
 * `--no-verify-jwt` because it serves only public market data and public news
 * headlines. It reads nothing from the database and writes nothing to it, so
 * there is no user data to protect — only the abuse surface below.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

/** A proxy that will fetch any URL is an open proxy. These two, and no others. */
const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart";
const GOOGLE_NEWS = "https://news.google.com/rss";

/**
 * Yahoo's ticker grammar: letters, digits, and the four punctuation marks it
 * uses for exchanges, indices and currency pairs (RY.TO, BRK-B, ^GSPC, CADINR=X).
 *
 * Anchored and length-capped. This value is interpolated into a request path,
 * and an unvalidated one there is exactly how a shim becomes something that
 * fetches whatever a caller likes.
 */
const SYMBOL = /^[A-Za-z0-9.\-^=]{1,20}$/;

/** Google News' own topic identifiers. An allowlist, for the same reason. */
const TOPICS: Record<string, string> = {
  top: "",
  world: "WORLD",
  business: "BUSINESS",
  technology: "TECHNOLOGY",
  science: "SCIENCE",
  health: "HEALTH",
  sports: "SPORTS",
  entertainment: "ENTERTAINMENT",
};

/** Long enough for a slow upstream, short enough that a hung request ends. */
const TIMEOUT_MS = 8_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function fetchUpstream(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      // Both upstreams serve differently, or not at all, without one.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FolioKit/1.0)" },
    });
    return response.ok ? response : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ── Quotes ──────────────────────────────────────────────────────────────── */

interface Quote {
  symbol: string;
  name: string | null;
  price: number | null;
  previousClose: number | null;
  currency: string | null;
  /** Percent change since the previous close, or null when either is missing. */
  changePercent: number | null;
}

async function quote(symbol: string): Promise<Quote | null> {
  const response = await fetchUpstream(
    `${YAHOO}/${encodeURIComponent(symbol)}?range=5d&interval=1d`,
  );
  if (!response) return null;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }

  const meta = (body as {
    chart?: { result?: { meta?: Record<string, unknown> }[] };
  })?.chart?.result?.[0]?.meta;
  if (!meta) return null;

  const price = typeof meta.regularMarketPrice === "number"
    ? meta.regularMarketPrice
    : null;
  const previousClose = typeof meta.chartPreviousClose === "number"
    ? meta.chartPreviousClose
    : null;

  return {
    symbol,
    name:
      (typeof meta.longName === "string" && meta.longName) ||
      (typeof meta.shortName === "string" && meta.shortName) ||
      null,
    price,
    previousClose,
    currency: typeof meta.currency === "string" ? meta.currency : null,
    // Guarded: a previous close of zero is not a real price, and dividing by
    // it would return Infinity as though it were a change.
    changePercent:
      price !== null && previousClose !== null && previousClose !== 0
        ? ((price - previousClose) / previousClose) * 100
        : null,
  };
}

/* ── News ────────────────────────────────────────────────────────────────── */

interface Article {
  title: string;
  url: string;
  source: string | null;
  publishedAt: string | null;
}

/**
 * Pull the fields out of an RSS document.
 *
 * A regex rather than an XML parser: the shape is fixed, the alternative is a
 * dependency in an edge runtime, and everything extracted is escaped before it
 * is returned as JSON. The client renders it as text, never as markup.
 */
function parseRss(xml: string, limit: number): Article[] {
  const items = xml.split("<item>").slice(1);
  const articles: Article[] = [];

  for (const item of items.slice(0, limit)) {
    const title = decodeXml(pick(item, "title"));
    const url = pick(item, "link");
    if (!title || !url) continue;

    articles.push({
      title,
      url,
      source: decodeXml(pick(item, "source")) || null,
      publishedAt: pick(item, "pubDate") || null,
    });
  }

  return articles;
}

function pick(item: string, tag: string): string {
  // Handles both `<title>x</title>` and `<source url="…">x</source>`.
  const match = item.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"),
  );
  if (!match) return "";
  return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // Ampersand last, or an already-decoded entity gets decoded twice.
    .replace(/&amp;/g, "&");
}

async function news(
  topic: string,
  query: string,
  limit: number,
): Promise<Article[] | null> {
  const region = "hl=en-CA&gl=CA&ceid=CA:en";

  // A search beats a topic when both are given: it is the more specific ask.
  const url = query
    ? `${GOOGLE_NEWS}/search?q=${encodeURIComponent(query)}&${region}`
    : TOPICS[topic]
      ? `${GOOGLE_NEWS}/headlines/section/topic/${TOPICS[topic]}?${region}`
      : `${GOOGLE_NEWS}?${region}`;

  const response = await fetchUpstream(url);
  if (!response) return null;

  return parseRss(await response.text(), limit);
}

/* ── Handler ─────────────────────────────────────────────────────────────── */

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");

  if (kind === "quote") {
    const raw = url.searchParams.get("symbols") ?? "";
    const symbols = raw
      .split(",")
      .map((symbol) => symbol.trim())
      .filter((symbol) => SYMBOL.test(symbol))
      // Capped: one request must not become twenty upstream requests.
      .slice(0, 12);

    if (symbols.length === 0) {
      return json({ error: "No valid symbols" }, 400);
    }

    // In parallel, and a failure of one is a null rather than a failure of all
    // — the same rule the dashboard's batch had to learn.
    const quotes = await Promise.all(symbols.map((symbol) => quote(symbol)));
    return json({ quotes: quotes.filter((entry) => entry !== null) });
  }

  if (kind === "news") {
    const topic = (url.searchParams.get("topic") ?? "top").toLowerCase();
    const query = (url.searchParams.get("q") ?? "").slice(0, 100);
    const limit = Math.min(
      Number(url.searchParams.get("limit") ?? 8) || 8,
      20,
    );

    if (!query && !(topic in TOPICS)) {
      return json({ error: "Unknown topic" }, 400);
    }

    const articles = await news(topic, query, limit);
    if (articles === null) return json({ error: "Upstream unavailable" }, 502);

    return json({ articles });
  }

  return json({ error: "Unknown kind" }, 400);
});
