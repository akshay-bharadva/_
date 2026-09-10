import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RepoGrid } from "./repo-grid";

let repos: object[] = [];
let isError = false;

vi.mock("@/store/api/publicApi", () => ({
  useGetSiteIdentityQuery: () => ({
    data: {
      profile_data: {
        github_projects_config: { show: true, username: "ada", projects_per_page: 2 },
      },
    },
    isLoading: false,
  }),
  useGetGitHubReposQuery: () => ({ data: repos, isLoading: false, isError }),
}));

const repo = (id: number, name: string, html_url = `https://github.com/ada/${name}`) => ({
  id,
  name,
  html_url,
  description: null,
  language: "TypeScript",
  stargazers_count: 1200,
  forks_count: 3,
});

beforeEach(() => {
  isError = false;
  repos = [repo(1, "one"), repo(2, "two"), repo(3, "three")];
});

describe("RepoGrid", () => {
  it("shows a page of repositories and loads the rest on request", () => {
    render(<RepoGrid />);
    expect(screen.queryByText("three")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Load more/ }));
    expect(screen.getByText("three")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Load more/ })).toBeNull();
  });

  it("groups large counts so they read at a glance", () => {
    render(<RepoGrid />);
    expect(screen.getAllByText("1,200")).toHaveLength(2);
  });

  it("does not turn an unsafe URL into a link", () => {
    repos = [repo(1, "evil", "javascript:alert(1)")];
    render(<RepoGrid />);
    expect(screen.getByText("evil").closest("a")).toBeNull();
  });

  it("says plainly when GitHub is unreachable", () => {
    isError = true;
    render(<RepoGrid />);
    expect(screen.getByText(/couldn.t be loaded from GitHub/)).toBeInTheDocument();
  });
});
