"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Briefcase,
  Coins,
  TrendingUp,
} from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Sparkline } from "@/features/dashboard/charts";
import { fetchJson } from "./sources";
import {
  cryptoUrl,
  describeSignal,
  formatPercent,
  fxSeriesUrl,
  indicatorUrl,
  INDICATORS,
  parseCoins,
  parseIndicator,
  parseRateSeries,
  sendSignal,
  type Coin,
  type Indicator,
  type RateSeries,
} from "./market";
import {
  jobsUrl,
  parseJobs,
  postedLabel,
  skillDemand,
  type Job,
} from "./career";

/**
 * Money, markets and the job market.
 *
 * Each panel owns its fetch and fails alone — independent services with
 * independent outages, and one being down should cost that panel and nothing
 * else. The dashboard's all-or-nothing batch already taught that lesson at the
 * cost of a blank page.
 *
 * The chart component is borrowed from the dashboard. That is a deliberate
 * cross-feature import of a presentational primitive with no state of its own;
 * a second sparkline here would drift from the first within a month.
 */

type State = "loading" | "done" | "failed";

function Panel({
  title,
  note,
  state,
  children,
}: {
  title: string;
  note?: string;
  state: State;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-surface bg-card p-4 shadow-e1">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {note && (
          <p className="shrink-0 text-[11px] text-muted-foreground">{note}</p>
        )}
      </div>

      {state === "loading" && (
        <p className="mt-3 text-sm text-muted-foreground">Reading…</p>
      )}
      {state === "failed" && (
        <p className="mt-3 text-sm text-muted-foreground">
          {/* Named, so you know whether to wait or to investigate. */}
          {title} did not answer just now.
        </p>
      )}
      {state === "done" && children}
    </section>
  );
}

/* ── Currency corridor ───────────────────────────────────────────────────── */

/**
 * The rate between where you earn and where you send.
 *
 * The most useful thing on this page for anyone supporting family abroad, and
 * the reason it is first: a single rate tells you nothing, but a rate against
 * its own last month tells you whether to send today or wait.
 */
export function CorridorPanel({
  base,
  quote,
}: {
  base: string;
  quote: string;
}) {
  const [series, setSeries] = useState<RateSeries | null>(null);
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    void (async () => {
      const body = await fetchJson(fxSeriesUrl(base, quote, 30));
      if (cancelled) return;

      const parsed = parseRateSeries(body, quote);
      setSeries(parsed);
      setState(parsed ? "done" : "failed");
    })();

    return () => {
      cancelled = true;
    };
  }, [base, quote]);

  const signal = series ? sendSignal(series.deviation) : "fair";

  return (
    <Panel title={`${base} → ${quote}`} note="30 days · ECB" state={state}>
      {series && (
        <>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {series.latest.toFixed(2)}
            </p>
            <span
              className={cn(
                "flex items-center gap-0.5 text-xs tabular-nums",
                signal === "good"
                  ? "text-chart-2"
                  : signal === "poor"
                    ? "text-chart-3"
                    : "text-muted-foreground",
              )}
            >
              {series.deviation >= 0 ? (
                <ArrowUpRight className="size-3" aria-hidden />
              ) : (
                <ArrowDownRight className="size-3" aria-hidden />
              )}
              {formatPercent(series.deviation)}
            </span>
          </div>

          <div className="mt-2">
            <Sparkline
              values={series.values}
              height={44}
              className={signal === "poor" ? "text-chart-3" : "text-chart-2"}
              label={`${base} to ${quote} over the last 30 days`}
            />
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            {describeSignal(signal, quote)}
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
            Month low {series.low.toFixed(2)} · high {series.high.toFixed(2)}
          </p>
        </>
      )}
    </Panel>
  );
}

/* ── Crypto ──────────────────────────────────────────────────────────────── */

export function CryptoPanel({ vs = "usd" }: { vs?: string }) {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const body = await fetchJson(cryptoUrl(vs));
      if (cancelled) return;
      if (body === null) {
        setState("failed");
        return;
      }
      setCoins(parseCoins(body, vs));
      setState("done");
    })();

    return () => {
      cancelled = true;
    };
  }, [vs]);

  return (
    <Panel title="Crypto" note="24h" state={state}>
      <ul className="mt-2 space-y-2">
        {coins.map((coin) => (
          <li
            key={coin.id}
            className="flex items-baseline justify-between gap-3"
          >
            <span className="flex items-center gap-1.5 text-sm text-foreground">
              <Coins className="size-3.5 text-muted-foreground" aria-hidden />
              {coin.symbol}
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-sm tabular-nums text-foreground">
                {formatMoney(
                  { amount: coin.price, currency: vs.toUpperCase() },
                  { whole: true },
                )}
              </span>
              <span
                className={cn(
                  "w-14 text-right text-xs tabular-nums",
                  coin.change24h >= 0 ? "text-chart-2" : "text-chart-3",
                )}
              >
                {formatPercent(coin.change24h)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ── Economy ─────────────────────────────────────────────────────────────── */

export function EconomyPanel({ country }: { country: string }) {
  const [rows, setRows] = useState<Indicator[]>([]);
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const bodies = await Promise.all([
        fetchJson(indicatorUrl(country, INDICATORS.inflation)),
        fetchJson(indicatorUrl(country, INDICATORS.unemployment)),
      ]);
      if (cancelled) return;

      const parsed = bodies
        .map((body) => parseIndicator(body))
        .filter((row): row is Indicator => row !== null);

      setRows(parsed);
      setState(parsed.length > 0 ? "done" : "failed");
    })();

    return () => {
      cancelled = true;
    };
  }, [country]);

  return (
    <Panel
      title="Economy"
      /* Said out loud: these are annual figures published in arrears, and a
         panel that implied otherwise would be worse than no panel. */
      note="World Bank · annual"
      state={state}
    >
      <ul className="mt-2 space-y-2">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex items-baseline justify-between gap-3"
          >
            <span className="min-w-0 truncate text-sm text-foreground">
              {row.label.replace(/,.*$/, "")}
            </span>
            <span className="flex shrink-0 items-baseline gap-2">
              <span className="text-sm tabular-nums text-foreground">
                {formatPercent(row.value)}
              </span>
              <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">
                {row.year}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ── Jobs and skills ─────────────────────────────────────────────────────── */

export function JobsPanel({ term }: { term: string }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    void (async () => {
      // A wider sample than is displayed: skill demand across six postings is
      // noise, and across forty it is a signal.
      const body = await fetchJson(jobsUrl(term, 40));
      if (cancelled) return;
      if (body === null) {
        setState("failed");
        return;
      }
      setJobs(parseJobs(body, 40));
      setState("done");
    })();

    return () => {
      cancelled = true;
    };
  }, [term]);

  const demand = skillDemand(jobs, 8);
  const top = demand.skills[0]?.count ?? 1;

  return (
    <section className="overflow-hidden rounded-surface bg-card shadow-e1">
      <header className="px-5 pb-2 pt-4">
        <h2 className="text-sm font-semibold text-foreground">
          Hiring {term ? `for “${term}”` : "right now"}
        </h2>
        <p className="text-xs text-muted-foreground">
          {/* The honest limit. "Three results" means three on one board, and a
              career decision deserves to know that. */}
          Remote roles on Remotive — one board, not the whole market
        </p>
      </header>

      {state === "loading" && (
        <p className="px-5 pb-4 text-sm text-muted-foreground">Reading…</p>
      )}
      {state === "failed" && (
        <p className="px-5 pb-4 text-sm text-muted-foreground">
          Remotive did not answer just now.
        </p>
      )}

      {state === "done" && jobs.length === 0 && (
        <p className="px-5 pb-4 text-sm text-muted-foreground">
          Nothing posted for this one. Try a broader term.
        </p>
      )}

      {demand.skills.length > 0 && (
        <div className="border-t border-border/60 px-5 py-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Most asked for · {demand.sampled} postings
          </p>
          <div className="mt-2 space-y-1.5">
            {demand.skills.map((skill) => (
              <div key={skill.tag} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-xs text-foreground">
                  {skill.tag}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    // Relative to the most-demanded skill, so the bars use the
                    // full width whatever the absolute counts are.
                    style={{ width: `${(skill.count / top) * 100}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                  {skill.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ul>
        {jobs.slice(0, 6).map((job) => (
          <li key={job.id}>
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-baseline gap-3 border-t border-border/60 px-5 py-2.5 transition-colors hover:bg-secondary/50"
            >
              <Briefcase
                className="size-3.5 shrink-0 self-center text-muted-foreground"
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate break-words text-sm text-foreground">
                  {job.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[
                    job.company,
                    job.location,
                    job.salary,
                    job.postedAt && postedLabel(job.postedAt),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <TrendingUp
                className="size-3 shrink-0 self-center text-muted-foreground"
                aria-hidden
              />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
