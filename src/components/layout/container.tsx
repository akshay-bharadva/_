import { cn } from "@/lib/utils";

/**
 * Public-site content column: max-w-6xl, mobile-first gutters.
 * Every public route composes inside this to keep a consistent measure.
 */
export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>
      {children}
    </div>
  );
}
