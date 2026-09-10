import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SITE_IDENTITY_DEFAULTS } from "@/lib/site-identity-defaults";
import type { SiteContent } from "@/types";
import { FooterView, wordmarkSize } from "./public-footer";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const identity = (overrides: Partial<SiteContent> = {}): SiteContent =>
  ({
    ...(structuredClone(SITE_IDENTITY_DEFAULTS) as unknown as SiteContent),
    ...overrides,
  }) as SiteContent;

describe("FooterView", () => {
  it("lists the site's pages when it is given them", () => {
    render(
      <FooterView
        identity={identity()}
        links={[
          { label: "About", href: "/about" },
          { label: "Blog", href: "/blog" },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Footer" });
    expect(nav).toHaveTextContent("About");
    expect(nav).toHaveTextContent("Blog");
  });

  /** The settings preview passes no links; no empty "Explore" column. */
  it("reserves nothing for pages it was not given", () => {
    render(<FooterView identity={identity()} />);
    expect(screen.queryByRole("navigation", { name: "Footer" })).toBeNull();
    expect(screen.queryByText("Explore")).toBeNull();
  });

  it("drops a social link whose URL is unusable", () => {
    render(
      <FooterView
        identity={identity({
          social_links: [
            { id: "github", label: "GitHub", url: "https://github.com/x", is_visible: true },
            { id: "evil", label: "Evil", url: "javascript:alert(1)", is_visible: true },
          ],
        } as Partial<SiteContent>)}
      />,
    );
    expect(screen.getByRole("link", { name: "GitHub" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Evil" })).toBeNull();
  });

  it("takes the reader back to the top", () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    render(<FooterView identity={identity()} />);
    fireEvent.click(screen.getByRole("button", { name: /Back to top/ }));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  /** The sign-off is decoration: hidden from assistive technology. */
  it("signs off with the logo as a large wordmark", () => {
    const base = identity();
    const { container } = render(
      <FooterView
        identity={
          {
            ...base,
            profile_data: {
              ...base.profile_data,
              logo: { main: "ada", highlight: ".dev" },
            },
          } as SiteContent
        }
      />,
    );
    const mark = container.querySelector("[data-wordmark]");
    expect(mark).toHaveTextContent("ada.dev");
    expect(mark).toHaveAttribute("aria-hidden", "true");
  });

  /** A long name must shrink to the band rather than be cropped. */
  it("sizes the wordmark by its length", () => {
    expect(wordmarkSize("ada")).toBe("min(11rem, 23.33vw)");
    expect(wordmarkSize("a".repeat(20))).toBe("min(11rem, 7.00vw)");
  });

  /** The five-tap admin shortcut is behaviour, not decoration — it stays. */
  it("keeps the secret tap on the copyright mark", () => {
    const onSecretTap = vi.fn();
    render(<FooterView identity={identity()} onSecretTap={onSecretTap} />);
    fireEvent.click(screen.getByText(/©/));
    expect(onSecretTap).toHaveBeenCalledTimes(1);
  });
});
