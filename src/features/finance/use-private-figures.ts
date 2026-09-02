"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Hiding the numbers, for when somebody is standing behind you.
 *
 * **Done in CSS rather than by wrapping every figure.** There are around a
 * hundred money values across twelve components in this module, and a `<Money>`
 * component would only hide the ones somebody remembered to migrate — the
 * balance that stayed visible would be the one that mattered. A class on the
 * container blurs all of them, including any added later, and the failure mode
 * of a *new* figure is that it is hidden too, which is the safe direction.
 *
 * Blurred rather than replaced with dots: the layout does not move, so nothing
 * reflows when it is toggled, and the shape of the page stays readable while
 * the amounts do not.
 *
 * **The preference is per-device and per-session.** It is a defence against
 * the person behind you, not against anyone with access to the account — the
 * data is one click away, and pretending otherwise would be the kind of
 * security theatre the Security module was rewritten to remove. `sessionStorage`
 * so it does not follow you to tomorrow, when you are probably alone again.
 */

const STORAGE_KEY = "finance_figures_hidden";

export function usePrivateFigures() {
  const [hidden, setHidden] = useState(false);

  // Read after mount, not during render: `sessionStorage` does not exist on the
  // server, and a static export renders this page's HTML at build time.
  useEffect(() => {
    try {
      setHidden(sessionStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      // Private windows and blocked site data throw on access rather than
      // returning null. Visible is the right default when we cannot ask.
    }
  }, []);

  const toggle = useCallback(() => {
    setHidden((previous) => {
      const next = !previous;
      try {
        sessionStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Not being able to remember the preference is not a reason to refuse
        // to apply it for this view.
      }
      return next;
    });
  }, []);

  return { hidden, toggle };
}
