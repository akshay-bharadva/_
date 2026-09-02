/**
 * The end of the feed, said out loud.
 *
 * A wall of cards that simply stops leaves the reader unsure whether they have
 * reached the bottom or whether something failed to load — the same argument
 * as the dashboard's "nothing is waiting" panel, which exists because an empty
 * region reads as a broken one.
 *
 * Set in the handwriting face to match the card titles, and at `text-xl`
 * rather than the metadata sizes around it: a script face carries much less
 * ink per pixel than the UI face, so the small sizes that work for a sans
 * label are unreadable here. `font-normal` is load-bearing for the same reason
 * it is on the card titles — `typography.css` is unlayered and applies
 * `--heading-weight` (700–800) to bare headings, and a handwriting face at
 * that weight closes its strokes up and smears.
 *
 * The rules either side are drawn with `bg-border` blocks rather than a
 * dashed hairline: a dotted rule is the retired v2 separator.
 */
export function FeedEnd({ label = "that's all for now" }: { label?: string }) {
  return (
    <div className="mt-16 flex items-center justify-center gap-4" role="note">
      <span aria-hidden className="h-px w-12 bg-border sm:w-20" />
      <p className="font-tahu text-xl font-normal leading-none text-muted-foreground">
        {label}
      </p>
      <span aria-hidden className="h-px w-12 bg-border sm:w-20" />
    </div>
  );
}
