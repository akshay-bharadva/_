"use client";

import { useEffect } from "react";

const SESSION_KEY = "visitNotified";

/**
 * Best-effort, session-deduped Discord ping on production home-page visits.
 * No-ops without NEXT_PUBLIC_VISIT_NOTIFIER_URL.
 */
export function useVisitNotifier(): void {
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_VISIT_NOTIFIER_URL;
    if (
      process.env.NODE_ENV !== "production" ||
      !url ||
      sessionStorage.getItem(SESSION_KEY)
    ) {
      return;
    }
    sessionStorage.setItem(SESSION_KEY, "1");
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: "Portfolio visit",
            fields: [
              { name: "Referrer", value: document.referrer || "direct" },
              { name: "User agent", value: navigator.userAgent.slice(0, 512) },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    }).catch(() => {
      // Telemetry only — never surface failures to the visitor.
    });
  }, []);
}
