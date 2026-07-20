import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false },
};

/** Centered card stage for the auth flow — no shell, no guard. */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background bg-graph-paper p-4 text-foreground">
      {children}
    </div>
  );
}
