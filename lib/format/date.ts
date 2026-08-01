/**
 * Fixed locale rather than the runtime default: these strings are produced on
 * the server and shipped as HTML, so a server whose locale differs from the
 * reader's would otherwise render a date the reader never chose, inconsistently
 * between deploys.
 */
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function formatDate(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return "—";

  return DATE_FORMAT.format(date);
}

// Same fixed-locale reasoning as DATE_FORMAT, plus a fixed 24-hour clock —
// the audit log is the one place in this app where exact ordering of
// same-day events matters, so the timestamp needs to actually show time.
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatDateTime(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return "—";

  return DATE_TIME_FORMAT.format(date);
}

/**
 * "2 minutes ago"-style relative time, computed once at render time —
 * same server-rendered-and-frozen approach as formatDate/formatDateTime
 * above (no client-side ticking interval), which is fine here since this
 * only ever backs a short recent-activity list, not a long-lived view.
 * Falls back to the fixed absolute date past a week out, where "N days ago"
 * stops being more useful than a real date.
 */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return "—";

  const diffMs = now - date.getTime();
  if (diffMs < 60_000) return "just now";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;

  return formatDate(iso);
}
