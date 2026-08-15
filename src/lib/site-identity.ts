import type { SiteContent } from "@/types";
import { SITE_IDENTITY_DEFAULTS } from "./site-identity-defaults";

/**
 * Fill in a `site_identity` row so the public UI can trust its shape.
 *
 * `profile_data`, `social_links` and `footer_data` are nullable JSONB columns.
 * Nothing in Postgres constrains what is inside them, but `SiteContent` types
 * every nested key as required — so the hero read
 * `profile_data.status_panel.availability` three levels deep with no guard. A
 * row written before a key existed, hand-edited in the SQL editor, or produced
 * by a partial settings save takes down the **public homepage** for every
 * visitor, not just the owner.
 *
 * Normalising once at the data boundary is preferable to optional chaining
 * scattered through the renderers: the components keep their honest types, and
 * there is a single place that decides what "missing" means. The defaults come
 * from `siteSettingsDefaultValues`, which is already the canonical empty shape
 * used by the settings form.
 */
export function normalizeSiteContent(row: Partial<SiteContent>): SiteContent {
  const defaults = SITE_IDENTITY_DEFAULTS;
  const profile = row.profile_data ?? ({} as SiteContent["profile_data"]);
  const statusPanel =
    profile.status_panel ?? defaults.profile_data.status_panel;

  return {
    ...row,
    portfolio_mode: row.portfolio_mode ?? defaults.portfolio_mode,
    profile_data: {
      ...defaults.profile_data,
      ...profile,
      status_panel: {
        ...defaults.profile_data.status_panel,
        ...statusPanel,
        currently_exploring: {
          ...defaults.profile_data.status_panel.currently_exploring,
          ...(statusPanel.currently_exploring ?? {}),
          /**
           * Guarded separately for two reasons. `.items.length` and
           * `.items.map` are called directly, so an absent array is a crash
           * rather than empty output — and the default seed is `[""]`, one
           * blank row for the settings form, which would otherwise render as
           * an empty bullet on the public panel. `siteSettingsSchema` strips
           * blanks on save; this matches it for data that never went through
           * validation.
           */
          items: (statusPanel.currently_exploring?.items ?? []).filter(
            (item) => item.trim() !== "",
          ),
        },
        latestProject: {
          ...defaults.profile_data.status_panel.latestProject,
          ...(statusPanel.latestProject ?? {}),
        },
      },
      github_projects_config: {
        ...defaults.profile_data.github_projects_config,
        ...(profile.github_projects_config ?? {}),
      },
      contact_page: {
        ...defaults.profile_data.contact_page,
        ...(profile.contact_page ?? {}),
      },
      // `bio` is mapped over on /about; blanks would render empty paragraphs.
      bio: (profile.bio ?? []).filter((line) => line.trim() !== ""),
    },
    social_links: row.social_links ?? [],
    footer_data: {
      ...defaults.footer_data,
      ...(row.footer_data ?? {}),
    },
  } as SiteContent;
}
