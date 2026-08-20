"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import type { WatchlistItem, WatchlistKind } from "@/types";
import {
  useDeleteWatchlistItemMutation,
  useGetWatchlistQuery,
  useSaveWatchlistItemMutation,
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
import { useConfirm } from "@/components/providers/ConfirmDialogProvider";
import { watchlistItemSchema, WATCHLIST_LIMITS } from "@/lib/schemas";
import { formatMoney } from "@/lib/money";
import { getErrorMessage } from "@/lib/utils";
import { cn } from "@/lib/cn";
import { fetchQuotes, hasLiveData, type Quote } from "./live";

/**
 * Instruments you are tracking, with prices where prices exist.
 *
 * The design turns on one fact: a bank mutual fund like RBF461 has a code its
 * own institution uses and no public feed carries. So a row does not require a
 * symbol. An item with one gets a live price; an item without is still a
 * tracked position with your own target and notes, and it says so rather than
 * showing a blank where a number should be.
 *
 * Prices arrive through the market-data edge function, and the panel works
 * without it — before deploy, every row simply reads as a held position. That
 * is a real state, not an error, because a watchlist without prices is still a
 * watchlist.
 */

const KINDS: { id: WatchlistKind; label: string }[] = [
  { id: "stock", label: "Stock" },
  { id: "etf", label: "ETF" },
  { id: "bond", label: "Bond" },
  { id: "mutual_fund", label: "Mutual fund" },
  { id: "other", label: "Other" },
];

const KIND_LABEL = new Map(KINDS.map((kind) => [kind.id, kind.label]));

export function Watchlist() {
  const { data: items = [] } = useGetWatchlistQuery();
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
  const [priced, setPriced] = useState<"idle" | "loading" | "done" | "off">(
    hasLiveData() ? "loading" : "off",
  );

  const symbols = useMemo(
    () =>
      items
        .map((item) => item.symbol?.trim())
        .filter((symbol): symbol is string => Boolean(symbol)),
    [items],
  );

  useEffect(() => {
    if (!hasLiveData() || symbols.length === 0) {
      setPriced(hasLiveData() ? "done" : "off");
      return;
    }

    let cancelled = false;
    setPriced("loading");

    void (async () => {
      const result = await fetchQuotes(symbols);
      if (cancelled) return;
      setQuotes(result);
      // An empty map means the function is not deployed or the upstream is
      // down. Either way the rows still render, without prices.
      setPriced(result.size > 0 ? "done" : "off");
    })();

    return () => {
      cancelled = true;
    };
    // Joined, so the effect re-runs when the *set* changes rather than on
    // every render that rebuilds the array.
  }, [symbols.join(",")]);

  const total = useMemo(() => {
    let value = 0;
    let currency: string | null = null;

    for (const item of items) {
      const quote = item.symbol
        ? quotes.get(item.symbol.toUpperCase())
        : undefined;
      if (!quote?.price || !item.quantity) continue;

      // Only sums a single currency. Adding CAD to USD would produce a figure
      // that is wrong in a way nobody would notice, and the FX conversion
      // belongs to Finance, not here.
      if (currency === null) currency = quote.currency ?? "CAD";
      if ((quote.currency ?? "CAD") !== currency) continue;

      value += quote.price * item.quantity;
    }

    return currency ? { value, currency } : null;
  }, [items, quotes]);

  return (
    <section className="overflow-hidden rounded-surface bg-card shadow-e1">
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-2 pt-4">
        <h2 className="text-sm font-semibold text-foreground">Watchlist</h2>
        {total && total.value > 0 ? (
          <p className="text-xs tabular-nums text-muted-foreground">
            Holdings{" "}
            {formatMoney({ amount: total.value, currency: total.currency })}
          </p>
        ) : (
          priced === "off" && (
            <p className="text-[11px] text-muted-foreground">
              Live prices need the market-data function deployed
            </p>
          )
        )}
      </header>

      {items.length === 0 ? (
        <p className="px-5 pb-4 text-sm text-muted-foreground">
          Add a stock, ETF, bond or fund and it is tracked here.
        </p>
      ) : (
        <ul>
          {items.map((item) => (
            <Row
              key={item.id}
              item={item}
              quote={
                item.symbol ? quotes.get(item.symbol.toUpperCase()) : undefined
              }
              loading={priced === "loading"}
            />
          ))}
        </ul>
      )}

      <AddItem count={items.length} />
    </section>
  );
}

function Row({
  item,
  quote,
  loading,
}: {
  item: WatchlistItem;
  quote?: Quote;
  loading: boolean;
}) {
  const [deleteItem] = useDeleteWatchlistItemMutation();
  const confirm = useConfirm();

  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${item.name}?`,
      description: "Only the watchlist entry goes; nothing else changes.",
      confirmText: "Remove",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await deleteItem(item.id).unwrap();
      toast.success("Removed from watchlist");
    } catch (error) {
      toast.error("Could not remove it", {
        description: getErrorMessage(error),
      });
    }
  };

  const change = quote?.changePercent ?? null;
  const currency = quote?.currency ?? item.currency ?? "CAD";

  // Whether the target has been met is the one judgement this row makes, and
  // only when both numbers exist.
  const hitTarget =
    item.target_price && quote?.price
      ? quote.price >= item.target_price
      : false;

  return (
    <li className="group flex items-center gap-3 border-t border-border/60 px-5 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 truncate break-words text-sm text-foreground">
            {item.name}
          </span>
          {item.symbol && (
            <span className="shrink-0 text-[11px] uppercase tabular-nums text-muted-foreground">
              {item.symbol}
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {[
            KIND_LABEL.get(item.kind),
            item.institution,
            item.quantity ? `${item.quantity} units` : null,
            item.target_price
              ? `target ${formatMoney({ amount: item.target_price, currency })}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>

      <span className="shrink-0 text-right">
        {quote?.price != null ? (
          <>
            <span
              className={cn(
                "block text-sm tabular-nums",
                hitTarget ? "font-semibold text-chart-2" : "text-foreground",
              )}
            >
              {formatMoney({ amount: quote.price, currency })}
            </span>
            {change !== null && (
              <span
                className={cn(
                  "flex items-center justify-end gap-0.5 text-[11px] tabular-nums",
                  change >= 0 ? "text-chart-2" : "text-chart-3",
                )}
              >
                {change >= 0 ? (
                  <TrendingUp className="size-3" aria-hidden />
                ) : (
                  <TrendingDown className="size-3" aria-hidden />
                )}
                {change.toFixed(2)}%
              </span>
            )}
          </>
        ) : (
          <span className="block text-[11px] text-muted-foreground">
            {loading
              ? "…"
              : item.symbol
                ? "no quote"
                : // Not a failure: this instrument never had a public price.
                  "tracked"}
          </span>
        )}
      </span>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${item.name}`}
        className="size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
        onClick={() => void remove()}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </li>
  );
}

function AddItem({ count }: { count: number }) {
  const [save, { isLoading }] = useSaveWatchlistItemMutation();
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [kind, setKind] = useState<WatchlistKind>("stock");
  const [institution, setInstitution] = useState("");
  const [quantity, setQuantity] = useState("");
  const [target, setTarget] = useState("");

  const submit = async () => {
    const draft = {
      name: name.trim(),
      symbol: symbol.trim() || null,
      kind,
      institution: institution.trim() || null,
      quantity: quantity.trim() ? Number(quantity) : null,
      target_price: target.trim() ? Number(target) : null,
      sort_order: count * 10,
    };

    const checked = watchlistItemSchema.safeParse(draft);
    if (!checked.success) {
      toast.error("Check the entry", {
        description: checked.error.errors[0]?.message,
      });
      return;
    }

    try {
      await save(draft).unwrap();
      setName("");
      setSymbol("");
      setInstitution("");
      setQuantity("");
      setTarget("");
      setOpen(false);
      toast.success("Added to watchlist");
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
        className="flex w-full items-center justify-center gap-2 border-t border-border/60 py-3 text-sm text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
      >
        <Plus className="size-4" aria-hidden />
        Track something
      </button>
    );
  }

  return (
    <div className="space-y-3 border-t border-border/60 p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="w-name" className="text-xs">
            Name
          </Label>
          <Input
            id="w-name"
            value={name}
            maxLength={WATCHLIST_LIMITS.NAME}
            placeholder="Royal Bank of Canada"
            onChange={(event) => setName(event.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="w-symbol" className="text-xs">
            Symbol{" "}
            <span className="text-muted-foreground">
              — optional, blank for a bank fund
            </span>
          </Label>
          <Input
            id="w-symbol"
            value={symbol}
            maxLength={WATCHLIST_LIMITS.SYMBOL}
            placeholder="RY.TO"
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="w-kind" className="text-xs">
            Kind
          </Label>
          <Select
            value={kind}
            onValueChange={(next) => setKind(next as WatchlistKind)}
          >
            <SelectTrigger id="w-kind" className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="w-institution" className="text-xs">
            Held at
          </Label>
          <Input
            id="w-institution"
            value={institution}
            maxLength={WATCHLIST_LIMITS.INSTITUTION}
            placeholder="RBC, CIBC, Questrade…"
            onChange={(event) => setInstitution(event.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="w-qty" className="text-xs">
            Units held
          </Label>
          <Input
            id="w-qty"
            value={quantity}
            inputMode="decimal"
            placeholder="0"
            onChange={(event) => setQuantity(event.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="w-target" className="text-xs">
            Target price
          </Label>
          <Input
            id="w-target"
            value={target}
            inputMode="decimal"
            placeholder="300"
            onChange={(event) => setTarget(event.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={!name.trim() || isLoading}
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
