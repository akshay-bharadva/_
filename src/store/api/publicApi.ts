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
  GitHubRepo,
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
  }),
});

export const {
  useGetSiteIdentityQuery,
  useGetNavLinksQuery,
  useGetPublishedBlogPostsQuery,
  useGetBlogPostBySlugQuery,
  useGetPublishedLifeUpdatesQuery,
  useGetSectionsByPathQuery,
  useGetGitHubReposQuery,
} = publicApi;
