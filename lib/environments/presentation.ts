/**
 * Display-only metadata for environments, keyed by name. Kept separate from
 * lib/environments/queries.ts (data) the same way lib/teams/roles.ts keeps
 * ROLE_LABELS/ROLE_DESCRIPTIONS separate from the membership queries.
 */

/** One-line purpose shown under each default environment's name in the tab strip. */
const PURPOSE: Record<string, string> = {
  development: "local machines",
  staging: "pre-release testing",
  production: "live customers",
};

/** Custom environments don't get an invented purpose sentence — nothing to show is honest. */
export function environmentPurpose(name: string): string | null {
  return PURPOSE[name] ?? null;
}

/**
 * The CSS custom property (already defined in app/globals.css) holding this
 * environment's accent colour. Used to set --env-accent at the AppShell root
 * so the top colour band and the sidebar's status dot can both read a single
 * inherited value rather than each re-deriving it. Custom environments fall
 * back to the neutral brand accent — they aren't part of the dev/staging/
 * production safety tier, so giving one production's crimson would be a false
 * safety signal, not a convenience.
 */
export function environmentAccentVar(name: string): string {
  if (name === "development") return "--accent-dev";
  if (name === "staging") return "--accent-staging";
  if (name === "production") return "--accent-production";
  return "--accent";
}

export type EnvironmentAccentClasses = { dot: string; text: string; border: string };

// Complete literal class strings, not interpolated fragments — Tailwind's
// build-time scanner needs to see each one in full to generate it; picking a
// whole string at runtime is safe, reconstructing one from parts is not.
const ACCENT_CLASSES: Record<string, EnvironmentAccentClasses> = {
  development: { dot: "bg-accent-dev", text: "text-accent-dev", border: "border-accent-dev" },
  staging: {
    dot: "bg-accent-staging",
    text: "text-accent-staging",
    border: "border-accent-staging",
  },
  production: {
    dot: "bg-accent-production",
    text: "text-accent-production",
    border: "border-accent-production",
  },
};

const DEFAULT_ACCENT_CLASSES: EnvironmentAccentClasses = {
  dot: "bg-accent",
  text: "text-accent",
  border: "border-accent",
};

export function environmentAccentClasses(name: string): EnvironmentAccentClasses {
  return ACCENT_CLASSES[name] ?? DEFAULT_ACCENT_CLASSES;
}
