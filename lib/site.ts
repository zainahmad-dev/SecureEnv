/**
 * The outbound links on the landing page (Phase 44).
 *
 * Env-overridable, with `null` meaning "don't render that link at all" —
 * the same absent-not-broken rule the rest of this app follows for actions
 * a viewer can't take. A landing page is the one place a dead link is
 * genuinely costly: it is the page someone opens *from a CV*, and a 404
 * behind "View the source" reads worse than no link.
 *
 * NEXT_PUBLIC_ because these are rendered into the browser bundle and are
 * not secret — they're public URLs whose whole purpose is to be clicked.
 */

/** Falls back to the repository this project is committed to. Override if the repo moves or is renamed. */
export const GITHUB_URL =
  process.env.NEXT_PUBLIC_GITHUB_URL?.trim() || "https://github.com/zainahmad-dev/secureenv";

/**
 * Deliberately has no default. A guessed portfolio URL is worse than a
 * missing one — the link simply doesn't render until
 * NEXT_PUBLIC_PORTFOLIO_URL is set.
 */
export const PORTFOLIO_URL = process.env.NEXT_PUBLIC_PORTFOLIO_URL?.trim() || null;
