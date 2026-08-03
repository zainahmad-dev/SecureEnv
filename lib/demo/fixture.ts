/**
 * The demo dataset, in one place.
 *
 * Both the create-from-nothing seed (scripts/seed.ts) and the periodic
 * reset (lib/demo/reset.ts) build the same rows from this file. That
 * matters more than it looks: three of the values below are *deliberately
 * broken* so the security scanner has something real to find, and
 * scripts/test-scanner.ts asserts on those three by name. Two copies of
 * this fixture would eventually disagree, and the way you'd find out is a
 * scanner test failing against data that looks fine.
 *
 * Pure data — no crypto, no database, no environment. Encryption happens at
 * the point of insert (always through encryptSecret, never as plaintext);
 * this file only ever describes what the plaintext should be.
 */

export const DEMO_TEAM_NAME = "Northstar Agency";

export const DEMO_PROJECT_NAMES = ["Client Dashboard", "Marketing Website", "Support Portal"];

/**
 * The project the three planted problems live in. Kept to one project on
 * purpose — a single project then tells the whole scanner story, and every
 * other project stays clean enough to be a useful contrast.
 */
export const PLANTED_PROBLEM_PROJECT = "Client Dashboard";

/**
 * Fixed, and not a secret: this is throwaway data in a public demo, not
 * anything the app protects. A randomly generated password would be
 * unrecoverable the moment the script exits, with nothing to show for it.
 */
export const DEMO_PASSWORD = "NorthstarDemo123!";

export type DemoRole = "admin" | "member" | "readonly";

export type DemoUser = {
  email: string;
  label: string;
  role: DemoRole;
  /**
   * True for the one account the public "Explore the demo" button signs
   * into. Flagged in the database as profiles.is_demo, which is what the
   * Phase 43 RESTRICTIVE policies read to make it read-only.
   */
  isDemo: boolean;
};

/**
 * Three role personas plus the public demo account.
 *
 * The public account is deliberately a *fourth* user rather than reusing
 * Riley: the RLS/member test scripts sign in as Riley to exercise ordinary
 * readonly behaviour, and flagging that same account as the locked-down
 * demo would change what those tests are actually testing.
 */
export const DEMO_USERS: DemoUser[] = [
  { email: "jordan@northstaragency.example", label: "Jordan (admin)", role: "admin", isDemo: false },
  { email: "casey@northstaragency.example", label: "Casey (member)", role: "member", isDemo: false },
  { email: "riley@northstaragency.example", label: "Riley (readonly)", role: "readonly", isDemo: false },
  { email: "demo@northstaragency.example", label: "Demo (public, read-only)", role: "readonly", isDemo: true },
];

export const DEMO_ACCOUNT_EMAIL = DEMO_USERS.find((user) => user.isDemo)!.email;

export type VariableSeed = { key: string; value: string };

/**
 * Seven realistic key names per environment. Every value is parameterised
 * by project slug and environment name so that nothing collides *by
 * accident* — which is what makes the one deliberate duplicate below
 * meaningful rather than noise.
 *
 * Every fake value here is also shaped to fail a real secret scanner's
 * pattern match: the "key body" carries literal words and underscores,
 * where a genuine provider key is pure base62. That isn't decoration —
 * an earlier, more realistic-looking fixture in this repo tripped GitHub's
 * push protection and had to be rewritten and the commit amended.
 */
function baseVariables(projectSlug: string, envName: string): VariableSeed[] {
  const stripePrefix = envName === "production" ? "sk_live_" : "sk_test_";

  return [
    {
      key: "DATABASE_URL",
      value: `postgresql://demo_user:demo_password@localhost:5432/${projectSlug}_${envName}`,
    },
    {
      key: "STRIPE_SECRET_KEY",
      value: `${stripePrefix}FAKE_${projectSlug}_${envName}_DO_NOT_USE`,
    },
    {
      key: "NEXTAUTH_SECRET",
      value: `demo-nextauth-secret-${projectSlug}-${envName}-not-real`,
    },
    {
      key: "RESEND_API_KEY",
      value: `re_FAKE_${projectSlug}_${envName}_DO_NOT_USE`,
    },
    {
      key: "NEXT_PUBLIC_APP_URL",
      value: `https://${projectSlug}-${envName}.northstaragency.example`,
    },
    {
      key: "REDIS_URL",
      value: `redis://demo:demo@localhost:6379/${projectSlug}-${envName}`,
    },
    {
      key: "JWT_SECRET",
      value: `demo-jwt-secret-${projectSlug}-${envName}-not-real`,
    },
  ];
}

/** The value shared between staging and production — the planted duplicate. */
const REUSED_SECRET = "reused-fake-secret-across-envs-warning";

/**
 * The three planted problems, applied only to PLANTED_PROBLEM_PROJECT:
 *
 *   1. a live-looking Stripe key sitting in development
 *   2. a JWT_SECRET under 16 characters
 *   3. one NEXTAUTH_SECRET value shared by staging and production
 *
 * scripts/test-scanner.ts asserts all three are found, and asserts that
 * *nothing else* in the dataset is reported as reused — which is only true
 * because baseVariables() parameterises everything else.
 */
function applyPlantedProblems(
  projectName: string,
  envName: string,
  variables: VariableSeed[],
): VariableSeed[] {
  if (projectName !== PLANTED_PROBLEM_PROJECT) return variables;

  return variables.map((variable) => {
    if (envName === "development" && variable.key === "STRIPE_SECRET_KEY") {
      return { ...variable, value: "sk_live_FAKE_client-dashboard_development_DO_NOT_USE" };
    }
    if (envName === "development" && variable.key === "JWT_SECRET") {
      return { ...variable, value: "short12" };
    }
    if ((envName === "staging" || envName === "production") && variable.key === "NEXTAUTH_SECRET") {
      return { ...variable, value: REUSED_SECRET };
    }
    return variable;
  });
}

/** Every variable one environment of one project should contain, planted problems included. */
export function demoVariables(
  projectName: string,
  projectSlug: string,
  envName: string,
): VariableSeed[] {
  return applyPlantedProblems(projectName, envName, baseVariables(projectSlug, envName));
}
