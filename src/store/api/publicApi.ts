import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
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
  LifeUpdate,
  PortfolioSection,
  SiteContent,
} from "@/types";

type NavLink = { label: string; href: string };

// Static mode: every endpoint resolves from portfolio.config.ts. When a
// database enters the picture these bodies gain live queries and this
// fallback shape becomes the no-credentials path.
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
        return { data: normalizeSiteContent(MOCK_SITE_IDENTITY) };
      },
      providesTags: ["SiteContent"],
    }),

    getNavLinks: builder.query<NavLink[], void>({
      queryFn: async () => {
        return { data: MOCK_NAV_LINKS };
      },
      providesTags: ["Navigation", "SiteContent"],
    }),

    getPublishedBlogPosts: builder.query<BlogPost[], void>({
      queryFn: async () => {
        return { data: MOCK_BLOG_POSTS };
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
        const post = MOCK_BLOG_POSTS.find((p) => p.slug === slug);
        if (!post)
          return {
            error: {
              message: "Not Found",
              details: "",
              hint: "",
              code: "404",
            },
          };
        return { data: post };
      },
      providesTags: (result) =>
        result ? [{ type: "Post", id: result.id }] : [],
    }),

    getPublishedLifeUpdates: builder.query<LifeUpdate[], void>({
      queryFn: async () => {
        return { data: MOCK_LIFE_UPDATES };
      },
      providesTags: ["LifeUpdates"],
    }),

    getSectionsByPath: builder.query<PortfolioSection[], string>({
      queryFn: async (pagePath) => {
        return {
          data: MOCK_SECTIONS.filter((s) => s.page_path === pagePath),
        };
      },
      providesTags: (result, error, path) => [{ type: "Portfolio", id: path }],
    }),
  }),
});

export const {
  useGetSiteIdentityQuery,
  useGetNavLinksQuery,
  useGetPublishedBlogPostsQuery,
  useGetBlogPostBySlugQuery,
  useGetPublishedLifeUpdatesQuery,
  useGetSectionsByPathQuery,
} = publicApi;
