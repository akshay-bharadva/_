/**
 * Standard public page opener: mono kicker, display heading, optional
 * subheading, dotted rule.
 */
export function PageHeader({
  kicker,
  title,
  subheading,
}: {
  kicker?: string;
  title: string;
  subheading?: string;
}) {
  return (
    <header className="mb-12">
      {kicker && <p className="section-label text-primary">{kicker}</p>}
      <h1 className="mt-2 font-heading text-4xl font-bold tracking-tight sm:text-5xl">
        {title}
      </h1>
      {subheading && (
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          {subheading}
        </p>
      )}
      <hr className="rule-dotted mt-8" aria-hidden />
    </header>
  );
}
