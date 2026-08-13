import "@/styles/globals.css";
import "@/styles/themes.css";
import "@/styles/typography.css";
import "prism-themes/themes/prism-one-dark.css";
import type { Metadata, Viewport } from "next";
import { config as appConfig } from "@/lib/config";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: appConfig.site.title,
    template: `%s | ${appConfig.site.author}`,
  },
  description: appConfig.site.description,
  metadataBase: new URL(appConfig.site.url),
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
