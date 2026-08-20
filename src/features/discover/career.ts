/**
 * Career signal: what the market is hiring for, and at what.
 *
 * Two sources, both keyless and both CORS-open. Remotive carries remote roles
 * with a search parameter; Arbeitnow is a broader board with no search, used
 * as a fallback when a search returns nothing.
 *
 * The honest limit, stated here because the UI has to say it too: these are
 * two job boards, not the job market. A search returning three results means
 * "three on Remotive", never "three in the world". A panel that implies
 * otherwise would be actively misleading to somebody making a decision about
 * their career.
 */

export interface Job {
  id: string;
  title: string;
  company: string;
  url: string;
  location?: string;
  salary?: string;
  postedAt?: string;
  tags: string[];
}

export function jobsUrl(term: string, limit = 6): string {
  const search = term.trim();
  // Encoded, not interpolated: a search for "c++" or "a & b" would otherwise
  // truncate the query and quietly return something else.
  const query = search ? `&search=${encodeURIComponent(search)}` : "";
  return `https://remotive.com/api/remote-jobs?limit=${limit}${query}`;
}

export function parseJobs(body: unknown, limit = 6): Job[] {
  const rows = (body as { jobs?: unknown[] } | null)?.jobs;
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row): Job | null => {
      if (typeof row !== "object" || row === null) return null;
      const record = row as Record<string, unknown>;

      const title = text(record.title);
      const url = text(record.url);
      if (!title || !url) return null;

      return {
        id: String(record.id ?? url),
        title,
        company: text(record.company_name) ?? "Unknown",
        url,
        location: text(record.candidate_required_location) ?? undefined,
        // Remotive returns an empty string far more often than a figure, and
        // an empty salary line is worse than none.
        salary: text(record.salary) ?? undefined,
        postedAt: text(record.publication_date) ?? undefined,
        tags: Array.isArray(record.tags)
          ? record.tags.filter((tag): tag is string => typeof tag === "string")
          : [],
      };
    })
    .filter((job): job is Job => job !== null)
    .slice(0, limit);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Which skills appear most across a set of postings.
 *
 * This is the part with actual career value. One job advert tells you what one
 * company wants; forty tell you what the market is asking for, and the gap
 * between that list and your own is the thing worth acting on.
 *
 * Counts are only meaningful against the sample they came from, so the total
 * is returned alongside them — "React, 12" means nothing without "of 40".
 */
export function skillDemand(
  jobs: Job[],
  limit = 10,
): { skills: { tag: string; count: number }[]; sampled: number } {
  const counts = new Map<string, number>();

  for (const job of jobs) {
    // Deduplicated per job, so one advert listing "react" three times does not
    // outvote three adverts that each list it once. Filtered rather than
    // iterating a Set, which the build's target does not allow.
    const seen: string[] = [];
    for (const raw of job.tags) {
      const tag = raw.toLowerCase();
      if (seen.indexOf(tag) !== -1) continue;
      seen.push(tag);
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const skills = Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    // Ties broken alphabetically, so the list does not reshuffle between
    // renders of identical data.
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);

  return { skills, sampled: jobs.length };
}

/**
 * `2026-08-14T09:00:00` → `5 days ago`.
 *
 * Counted in **calendar days**, not elapsed hours. Diffing timestamps says a
 * job posted yesterday at 23:00 and read at 01:00 was posted "today", because
 * only two hours passed — which is not what either word means to a reader.
 */
export function postedLabel(iso: string, now = new Date()): string {
  const posted = new Date(iso);
  if (Number.isNaN(posted.getTime())) return "";

  const startOf = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  const days = Math.round(
    (startOf(now) - startOf(posted)) / (24 * 60 * 60_000),
  );

  // A board occasionally post-dates a listing; "just posted" is friendlier
  // than a negative number of days.
  if (days < 0) return "just posted";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;

  const months = Math.floor(days / 30);
  return months === 1 ? "a month ago" : `${months} months ago`;
}
