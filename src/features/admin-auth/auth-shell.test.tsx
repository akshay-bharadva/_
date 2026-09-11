import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { SetupStatus } from "@/lib/setup-status";

const mocks = vi.hoisted(() => ({
  status: "ready" as SetupStatus | undefined,
  isLoading: false,
  refetch: vi.fn(),
}));

vi.mock("@/store/api/adminApi", () => ({
  useGetSetupStatusQuery: () => ({
    data: mocks.status,
    isLoading: mocks.isLoading,
    isFetching: false,
    refetch: mocks.refetch,
  }),
}));
vi.mock("@/store/api/publicApi", () => ({
  useGetSiteIdentityQuery: () => ({ data: undefined }),
}));

import { AuthShell, SetupGate } from "./auth-shell";

beforeEach(() => {
  mocks.status = "ready";
  mocks.isLoading = false;
  mocks.refetch.mockClear();
});

describe("SetupGate", () => {
  it("shows the sign-in screen once the database is ready", () => {
    render(<SetupGate>sign-in form</SetupGate>);
    expect(screen.getByText("sign-in form")).toBeInTheDocument();
  });

  /** A static site has no workspace; a form that cannot succeed helps nobody. */
  it("explains how to connect a database instead of offering a form", () => {
    mocks.status = "no-database";
    render(<SetupGate>sign-in form</SetupGate>);
    expect(screen.queryByText("sign-in form")).toBeNull();
    expect(
      screen.getByRole("heading", { name: /Connect a database/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("NEXT_PUBLIC_SUPABASE_URL")).toBeInTheDocument();
  });

  it("says to run the schema when Supabase answers without it, and checks again", () => {
    mocks.status = "no-schema";
    render(<SetupGate>sign-in form</SetupGate>);
    expect(
      screen.getByRole("heading", { name: /set up the database/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Check again/ }));
    expect(mocks.refetch).toHaveBeenCalled();
  });

  /** A paused project or a blip should not hide sign-in; its error says more. */
  it("still offers sign-in when the database is only unreachable", () => {
    mocks.status = "unreachable";
    render(<SetupGate>sign-in form</SetupGate>);
    expect(screen.getByText("sign-in form")).toBeInTheDocument();
  });
});

describe("AuthShell", () => {
  it("offers a way back to the public site", () => {
    render(<AuthShell>form</AuthShell>);
    expect(screen.getByRole("link", { name: /Back to the site/ })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
