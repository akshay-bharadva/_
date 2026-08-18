"use client";

import { useEffect, useRef } from "react";
import type { FxRateRow } from "@/types";
import { useCacheFxRatesMutation } from "@/store/api/adminApi";
import { fetchLatestRates, isRateAvailable, snapshotToRows } from "./fx-source";

/**
 * Keep the rate cache current, quietly.
 *
 * Runs when the finance module opens and does nothing the rest of the time.
 * The ECB publishes once per working day, so there is no value in polling and
 * a good deal of value in not: the fetch is skipped entirely if the cache
 * already holds today's rates.
 *
 * Every failure path is silent. Rates improve a ledger that has to work
 * without them — an unreachable feed means amounts show in their own currency
 * and the base total says it is incomplete, which is a degraded module rather
 * than a broken one, and a toast about a European central bank is not
 * something anyone opening their budget wants to deal with.
 */
export function useFxSync(base: string | undefined, cached: FxRateRow[]) {
  const [cacheFxRates] = useCacheFxRatesMutation();

  // Guards against React 18 double-invoking the effect in development, and
  // against a re-render mid-flight firing a second identical request.
  const inFlight = useRef(false);

  useEffect(() => {
    if (!base || !isRateAvailable(base)) return;
    if (inFlight.current) return;

    // The ECB publishes on working days only, so "no row for today" is normal
    // on a Sunday. Comparing against the newest cached date rather than
    // today's date means a weekend does not trigger a fetch every reload.
    const newest = cached.reduce<string>(
      (latest, row) => (row.as_of > latest ? row.as_of : latest),
      "",
    );
    const today = new Date().toISOString().slice(0, 10);
    if (newest >= today) return;

    let cancelled = false;
    const controller = new AbortController();
    inFlight.current = true;

    void (async () => {
      try {
        const snapshot = await fetchLatestRates(base, controller.signal);
        if (cancelled || !snapshot) return;

        // The feed may hand back a date we already hold — on a weekend it
        // returns Friday's. Writing it again is harmless (the upsert is on the
        // primary key) but pointless, and skipping keeps the request count
        // honest in the network tab.
        if (snapshot.asOf <= newest) return;

        await cacheFxRates(snapshotToRows(snapshot)).unwrap();
      } catch {
        // Silent by design; see the note above.
      } finally {
        inFlight.current = false;
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      inFlight.current = false;
    };
  }, [base, cached, cacheFxRates]);
}
