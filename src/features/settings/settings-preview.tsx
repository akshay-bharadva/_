"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Monitor, Smartphone } from "lucide-react";
import type { SiteContent } from "@/types";
import { CUSTOM_THEME, customThemeVars, resolveThemeClass } from "@/lib/themes";
import { normalizeSiteContent } from "@/lib/site-identity";
import { cn } from "@/lib/cn";
import { HeroView } from "@/features/home/hero";
import { AboutView } from "@/features/about/about-page";
import { ContactView } from "@/features/contact/contact-page";
import type { PreviewPage } from "./settings-groups";

/**
 * The public site, rendered against unsaved form values.
 *
 * Three decisions worth keeping:
 *
 * 1. **Real components.** `HeroView`, `AboutView` and `ContactView` are the
 *    same views the public routes render, split out of their fetching wrappers
 *    for this. A lookalike would be a second copy of the design to keep in
 *    sync, and the copy you judged a theme against would be the one that never
 *    shipped.
 *
 * 2. **Scoped theme.** The `theme-*` class and any custom palette go on this
 *    subtree, not on `<html>`. Applying them globally would repaint the admin
 *    around you every time you moved through 52 presets — and would leave the
 *    site in the last theme you hovered if you navigated away without saving.
 *
 * 3. **Scaled, not narrowed.** The frame renders at a real desktop width and is
 *    scaled down with a transform. Rendering the components into a 380px column
 *    would show their mobile layout, which is not the layout you are choosing
 *    a theme for.
 */

const FRAME_WIDTHS = {
  desktop: 1180,
  mobile: 420,
} as const;

type Viewport = keyof typeof FRAME_WIDTHS;

const PAGE_LABELS: Record<PreviewPage, string> = {
  home: "Home",
  about: "About",
  contact: "Contact",
};

/** A block the preview cannot render live, drawn as an outline instead. */
function InertBlock({ label, note }: { label: string; note: string }) {
  return (
    <div className="rounded-surface border border-dashed border-border p-6 text-center">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function PreviewPageBody({
  page,
  identity,
}: {
  page: PreviewPage;
  identity: SiteContent;
}) {
  if (page === "home") return <HeroView identity={identity} />;

  if (page === "about") {
    return (
      <div className="px-6 py-12 sm:px-10">
        <AboutView identity={identity} />
      </div>
    );
  }

  return (
    <ContactView
      identity={identity}
      // The real form posts to the database and the services block runs the
      // CMS sections query. Neither belongs inside a preview, but whether they
      // are *shown* is exactly what this group's switches decide — so the
      // outline appears and disappears with the switch.
      form={
        <InertBlock
          label="Contact form"
          note="Live on the public page; inert here."
        />
      }
      services={
        <InertBlock
          label="Services"
          note="Managed as CMS sections for /contact."
        />
      }
    />
  );
}

export interface SettingsPreviewProps {
  /** Current form values, already shaped like a site_identity row. */
  values: Partial<SiteContent>;
  /** Which page to open on; follows the selected group. */
  page: PreviewPage;
  onPageChange: (page: PreviewPage) => void;
  className?: string;
}

export function SettingsPreview({
  values,
  page,
  onPageChange,
  className,
}: SettingsPreviewProps) {
  const [viewport, setViewport] = useState<Viewport>("desktop");

  // Normalising here as well as at load is not redundant: the form holds
  // half-typed values, and a blank bio row or a social link with no url must
  // not reach a renderer that assumes the public data contract.
  const identity = useMemo(() => normalizeSiteContent(values), [values]);

  const themeClass = resolveThemeClass(identity.profile_data.default_theme);
  const isCustom = themeClass === CUSTOM_THEME;
  const colors = identity.profile_data.custom_theme_colors;

  const paletteStyle = useMemo<CSSProperties>(
    () =>
      isCustom && colors ? (customThemeVars(colors) as CSSProperties) : {},
    [isCustom, colors],
  );

  const width = FRAME_WIDTHS[viewport];
  const typography = identity.profile_data.typography_preset;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Preview page"
          className="flex items-center gap-1"
        >
          {(Object.keys(PAGE_LABELS) as PreviewPage[]).map((candidate) => (
            <button
              key={candidate}
              type="button"
              role="tab"
              aria-selected={candidate === page}
              onClick={() => onPageChange(candidate)}
              className={cn(
                "rounded-control px-2.5 py-1 text-xs font-medium transition-colors",
                candidate === page
                  ? "bg-card text-foreground shadow-e1"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {PAGE_LABELS[candidate]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {(Object.keys(FRAME_WIDTHS) as Viewport[]).map((candidate) => {
            const Icon = candidate === "desktop" ? Monitor : Smartphone;
            return (
              <button
                key={candidate}
                type="button"
                aria-label={`${candidate} width`}
                aria-pressed={candidate === viewport}
                onClick={() => setViewport(candidate)}
                className={cn(
                  "rounded-control p-1.5 transition-colors",
                  candidate === viewport
                    ? "bg-card text-foreground shadow-e1"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
              </button>
            );
          })}
        </div>
      </div>

      <PreviewFrame
        width={width}
        themeClass={themeClass}
        typographyClass={typography}
        paletteStyle={paletteStyle}
      >
        <PreviewPageBody page={page} identity={identity} />
      </PreviewFrame>
    </div>
  );
}

/**
 * The clipped, scaled window.
 *
 * The scale is measured rather than declared: the pane's width is whatever the
 * three-column layout leaves it, and the frame renders at a fixed desktop
 * width. Measuring the scaled content's height as well is what keeps the
 * scroll extent honest — a `transform: scale()` does not change layout size, so
 * without it the pane would reserve room for the full unscaled page and end in
 * a screen of empty background.
 */
function PreviewFrame({
  width,
  themeClass,
  typographyClass,
  paletteStyle,
  children,
}: {
  width: number;
  themeClass: string;
  typographyClass: string | undefined;
  paletteStyle: CSSProperties;
  children: React.ReactNode;
}) {
  const paneRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 1, height: 0 });

  useEffect(() => {
    const pane = paneRef.current;
    const content = contentRef.current;
    if (!pane || !content) return;

    const measure = () => {
      const scale = pane.clientWidth > 0 ? pane.clientWidth / width : 1;
      setBox({ scale, height: content.offsetHeight * scale });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    observer.observe(content);
    measure();
    return () => observer.disconnect();
  }, [width]);

  return (
    <div
      ref={paneRef}
      className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-surface bg-card shadow-e2"
    >
      <div style={{ height: box.height || undefined }}>
        <div
          ref={contentRef}
          className={cn(
            themeClass,
            typographyClass && typographyClass !== "typo-default"
              ? typographyClass
              : undefined,
            "origin-top-left bg-background text-foreground",
          )}
          style={{
            ...paletteStyle,
            width,
            transform: `scale(${box.scale})`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
