import type { SiteContent } from "@/types";
import { BUCKET_NAME } from "@/lib/constants";
import { DEFAULT_THEME } from "@/lib/themes";

/**
 * What a new owner has left to do before their site is theirs.
 *
 * Derived from what is actually in the database rather than from boxes the
 * owner ticks — a checklist that trusts the user to say "done" is a list of
 * reminders, and it goes stale the first time one is ticked by accident.
 */

export interface SetupInputs {
  identity?: SiteContent;
  sectionCount: number;
  publishedPostCount: number;
  /** "unknown" when it could not be checked — then it is not nagged about. */
  storage: "ok" | "missing" | "unknown";
}

export interface SetupItem {
  id: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
}

export function setupItems({
  identity,
  sectionCount,
  publishedPostCount,
  storage,
}: SetupInputs): SetupItem[] {
  const profile = identity?.profile_data;
  const hasLink = (identity?.social_links ?? []).some(
    (link) => link.is_visible !== false && link.url.trim() !== "",
  );

  return [
    {
      id: "profile",
      title: "Say who you are",
      description: "Your name, your role and a photo.",
      href: "/admin/settings",
      done: !!profile?.name?.trim() && !!profile?.title?.trim(),
    },
    {
      id: "pitch",
      title: "Write your headline",
      description: "The one line a visitor should leave with — and your results.",
      href: "/admin/settings",
      done: !!profile?.headline?.trim(),
    },
    {
      id: "look",
      title: "Pick a look",
      description: "A theme and a type pairing that feel like you.",
      href: "/admin/settings",
      done:
        !!profile &&
        ((profile.default_theme ?? DEFAULT_THEME) !== DEFAULT_THEME ||
          (profile.typography_preset ?? "typo-default") !== "typo-default"),
    },
    {
      id: "links",
      title: "Add where people find you",
      description: "GitHub, LinkedIn, email — shown in the hero and the footer.",
      href: "/admin/settings",
      done: hasLink,
    },
    {
      id: "pages",
      title: "Fill your pages",
      description: "Services, case studies and experience, from ready-made sections.",
      href: "/admin/content",
      done: sectionCount > 0,
    },
    {
      id: "post",
      title: "Publish a first post",
      description: "Something you learned, built or shipped.",
      href: "/admin/blog",
      done: publishedPostCount > 0,
    },
    {
      id: "storage",
      title: "Create the image bucket",
      description: `A public Supabase storage bucket named “${BUCKET_NAME}”, for uploads.`,
      href: "/admin/assets",
      done: storage !== "missing",
    },
  ];
}
