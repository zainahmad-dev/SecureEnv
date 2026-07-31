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
