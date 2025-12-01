import "@/styles/globals.css";
import "@/styles/themes.css";
import "@/styles/typography.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Foliokit",
  description: "A developer portfolio that works out of the box.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
