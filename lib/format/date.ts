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
