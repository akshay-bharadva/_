import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import { supabase } from "@/supabase/client";
import {
  MOCK_SITE_IDENTITY,
  MOCK_BLOG_POSTS,
  MOCK_SECTIONS,
  MOCK_NAV_LINKS,
  MOCK_LIFE_UPDATES,
} from "@/lib/fallback-data";
import { normalizeSiteContent } from "@/lib/site-identity";
import type {
  BlogPost,
  GitHubRepo,
  LifeUpdate,
  PortfolioSection,
  SiteContent,
} from "@/types";

type NavLink = { label: string; href: string };

export const publicApi = createApi({
  reducerPath: "publicApi",
  baseQuery: fakeBaseQuery(),
  tagTypes: [
    "SiteContent",
    "Posts",
    "Post",
    "Portfolio",
    "Navigation",
    "SiteSettings",
    "LifeUpdates",
  ],
  endpoints: (builder) => ({
    getSiteIdentity: builder.query<SiteContent, void>({
      queryFn: async () => {
        // --- MOCK FALLBACK ---
        if (!supabase) {
          return { data: normalizeSiteContent(MOCK_SITE_IDENTITY) };
        }
        // ---------------------

        const { data, error } = await supabase
          .from("site_identity")
          .select("*")
          .single();
        if (error) return { error };
        // profile_data is unconstrained JSONB; normalising here means the
        // public renderers can rely on the shape SiteContent promises.
        return { data: normalizeSiteContent(data as Partial<SiteContent>) };
      },
      providesTags: ["SiteContent"],
    }),

    getNavLinks: builder.query<NavLink[], void>({
      queryFn: async () => {
        // --- MOCK FALLBACK ---
        if (!supabase) {
          return { data: MOCK_NAV_LINKS };
        }
        // ---------------------

        const [identityRes, linksRes] = await Promise.all([
          supabase.from("site_identity").select("portfolio_mode").single(),
          supabase
            .from("navigation_links")
            .select("label, href")
            .eq("is_visible", true)
            .order("display_order"),
        ]);

        if (linksRes.error) return { error: linksRes.error };

        const portfolioMode = identityRes.data?.portfolio_mode || "multi-page";
        let finalLinks = linksRes.data || [];

        if (portfolioMode === "single-page") {
          finalLinks = finalLinks.filter(
            (link) =>
              link.href === "/" ||
              link.href === "/contact" ||
              link.href === "/blog",
          );
        }
        return { data: finalLinks };
      },
      providesTags: ["Navigation", "SiteContent"],
    }),

    getPublishedBlogPosts: builder.query<BlogPost[], void>({
      queryFn: async () => {
        // --- MOCK FALLBACK ---
        if (!supabase) {
          return { data: MOCK_BLOG_POSTS };
        }
        // ---------------------

        // List view: everything except `content` — read time comes from the
        // word_count generated column, so full post bodies stay out of the
        // list payload. Requires the current db/schema.sql to be applied.
        const { data, error } = await supabase
          .from("blog_posts")
          .select(
            "id, user_id, title, slug, excerpt, cover_image_url, published, published_at, show_toc, tags, views, word_count, created_at, updated_at",
          )
          .eq("published", true)
          .order("published_at", { ascending: false });
        if (error) return { error };
        return { data };
      },
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "Posts" as const, id })),
              { type: "Posts", id: "LIST" },
            ]
          : [{ type: "Posts", id: "LIST" }],
    }),

    getBlogPostBySlug: builder.query<BlogPost, string>({
      queryFn: async (slug) => {
        // --- MOCK FALLBACK ---
        if (!supabase) {
          const post = MOCK_BLOG_POSTS.find((p) => p.slug === slug);
          if (!post)
            return {
              error: {
                message: "Not Found",
                details: "Mock",
                hint: "",
                code: "404",
              },
            };
          return { data: post };
        }
        // ---------------------

        const { data, error } = await supabase
          .from("blog_posts")
          .select("*")
          .eq("slug", slug)
          .eq("published", true)
          .single();
        if (error && error.code !== "PGRST116") return { error };
        if (!data)
          return {
            error: { message: "Not Found", details: "", hint: "", code: "404" },
          };
        return { data };
      },
      providesTags: (result) =>
        result ? [{ type: "Post", id: result.id }] : [],
    }),

    incrementPostView: builder.mutation<void, string>({
      queryFn: async (postId) => {
        // --- MOCK FALLBACK ---
        if (!supabase) return { data: undefined };
        // ---------------------

        const { error } = await supabase.rpc("increment_blog_post_view", {
          post_id_to_increment: postId,
        });
        if (error) return { error };
        return { data: undefined };
      },
      invalidatesTags: (result, error, postId) => [
        { type: "Post", id: postId },
        { type: "Posts", id: "LIST" },
      ],
    }),

    getPublishedLifeUpdates: builder.query<LifeUpdate[], void>({
      queryFn: async () => {
        if (!supabase) {
          return { data: MOCK_LIFE_UPDATES };
        }
        const { data, error } = await supabase
          .from("public_notes")
          .select("*")
          .eq("is_published", true)
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: false });
        if (error) return { error };
        return { data };
      },
      providesTags: ["LifeUpdates"],
    }),

    getSectionsByPath: builder.query<PortfolioSection[], string>({
      queryFn: async (pagePath) => {
        // --- MOCK FALLBACK ---
        if (!supabase) {
          return {
            data: MOCK_SECTIONS.filter((s) => s.page_path === pagePath),
          };
        }
        // ---------------------

        const { data, error } = await supabase
          .from("portfolio_sections")
          .select("*, portfolio_items(*)")
          .eq("page_path", pagePath)
          .eq("is_visible", true)
          .order("display_order")
          .order("display_order", { foreignTable: "portfolio_items" });
        if (error) return { error };
        return { data };
      },
      providesTags: (result, error, path) => [{ type: "Portfolio", id: path }],
    }),

    getGitHubRepos: builder.query<
      GitHubRepo[],
      {
        username: string;
        sort_by: string;
        projects_per_page: number;
        page: number;
        exclude_forks: boolean;
        exclude_archived: boolean;
        exclude_profile_repo: boolean;
        min_stars: number;
      }
    >({
      queryFn: async (args) => {
        const {
          username,
          sort_by,
          projects_per_page,
          page,
          exclude_forks,
          exclude_archived,
          exclude_profile_repo,
          min_stars,
        } = args;
        const url = `https://api.github.com/users/${username}/repos?sort=${sort_by}&per_page=${projects_per_page}&type=owner&page=${page}`;
        try {
          const response = await fetch(url);
          if (!response.ok)
            throw new Error(
              `GitHub API request failed: ${response.statusText}`,
            );
          const data: GitHubRepo[] = await response.json();
          const filtered = data.filter((p) => {
            if (exclude_forks && p.fork) return false;
            if (exclude_archived && p.archived) return false;
            if (exclude_profile_repo && p.name === username) return false;
            if (p.stargazers_count < min_stars) return false;
            return !p.private;
          });
          return { data: filtered };
        } catch (error: unknown) {
          return {
            error: {
              message: error instanceof Error ? error.message : "Unknown error",
              details: "",
              hint: "",
              code: "FETCH_ERROR",
            },
          };
        }
      },
    }),

    /**
     * The only public write path in the app.
     *
     * **Dynamic mode** inserts the row and stops. The Discord notification is
     * sent by an AFTER INSERT trigger reading the webhook URL from an
     * admin-only table (`db/migrations/007-contact-inbox.sql`). It used to be
     * sent from here, from the browser, using
     * `NEXT_PUBLIC_CONTACT_WEBHOOK_URL` — which is compiled into the client
     * bundle, so anyone could read the URL out of the JS and post arbitrary
     * embeds into the channel. Moving it into the database also ties the ping
     * to a row that exists rather than to a caller's word, and applies it to
     * inserts that never went through this form.
     *
     * **Static mode** has no database to trigger from, so the browser call
     * remains the only way a message can reach anyone. The URL is unavoidably
     * public in a static deployment; that is a property of having no server,
     * not a choice made here.
     *
     * Length bounds and the rate limit behind them are enforced by the
     * database. `contactFormSchema` is the courtesy copy that produces a
     * useful message before the round trip.
     */
    submitContactForm: builder.mutation<
      void,
      { name: string; email: string; subject: string; message: string }
    >({
      queryFn: async (formData) => {
        if (supabase) {
          const { error } = await supabase
            .from("contact_submissions")
            .insert(formData);
          if (error) return { error };
          return { data: undefined };
        }

        const webhookUrl = process.env.NEXT_PUBLIC_CONTACT_WEBHOOK_URL || "";
        if (!webhookUrl) {
          // Nowhere to put it. A success message for a message that went
          // nowhere is worse than an honest failure.
          return {
            error: {
              message:
                "This site has no message delivery configured. Please use one of the direct links instead.",
            },
          };
        }

        try {
          const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username: "Portfolio Contact",
              embeds: [
                {
                  title: "New contact form submission",
                  color: 5814783,
                  fields: [
                    { name: "Name", value: formData.name, inline: true },
                    { name: "Email", value: formData.email, inline: true },
                    { name: "Subject", value: formData.subject },
                    // Discord drops the whole embed rather than truncating a
                    // field over 1024 characters.
                    { name: "Message", value: formData.message.slice(0, 1000) },
                  ],
                  timestamp: new Date().toISOString(),
                  footer: { text: "Contact Form" },
                },
              ],
            }),
          });
          if (!response.ok) {
            return {
              error: { message: "The message could not be delivered." },
            };
          }
        } catch {
          return { error: { message: "The message could not be delivered." } };
        }

        return { data: undefined };
      },
    }),

    getLockdownStatus: builder.query<number, void>({
      queryFn: async () => {
        if (!supabase) return { data: 0 }; // Mock: Always normal
        const { data, error } = await supabase
          .from("security_settings")
          .select("lockdown_level")
          .single();
        if (error || !data) return { data: 0 };
        return { data: data.lockdown_level };
      },
      keepUnusedDataFor: 60,
    }),
  }),
});

export const {
  useGetSiteIdentityQuery,
  useGetNavLinksQuery,
  useGetPublishedBlogPostsQuery,
  useGetBlogPostBySlugQuery,
  useIncrementPostViewMutation,
  useSubmitContactFormMutation,
  useGetPublishedLifeUpdatesQuery,
  useGetSectionsByPathQuery,
  useGetGitHubReposQuery,
  useGetLockdownStatusQuery,
} = publicApi;
