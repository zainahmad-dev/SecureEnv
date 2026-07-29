/**
 * Human-readable countdown for an invite's expiry.
 *
 * Only ever rendered from Server Components, so there's no hydration mismatch
 * to worry about — nothing on the client re-renders this string against a
 * different clock.
 */
export function describeExpiry(expiresAt: string, now: number = Date.now()): string {
  const remainingMs = new Date(expiresAt).getTime() - now;

  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return "Expired";

  const hours = Math.floor(remainingMs / 3_600_000);

  if (hours < 1) return "Expires in under an hour";
  if (hours < 24) return `Expires in ${hours} hour${hours === 1 ? "" : "s"}`;

  const days = Math.round(hours / 24);

  return `Expires in ${days} day${days === 1 ? "" : "s"}`;
}

export function hasExpired(expiresAt: string, now: number = Date.now()): boolean {
  const time = new Date(expiresAt).getTime();

  return !Number.isFinite(time) || time <= now;
}
