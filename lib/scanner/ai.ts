import { z } from "zod";
import { callAI } from "@/lib/ai/client";
import { containsSecretLikeContent } from "@/lib/ai/guard";
import { daysSince } from "@/lib/scanner/rules";
import type { Finding, ScanProject, Severity } from "@/lib/scanner/types";
import { SEVERITY_ORDER } from "@/lib/scanner/types";

/**
 * The LLM half of the security scanner.
 *
 * ===========================================================================
 * WHY NO VALUE IS IN THE PAYLOAD
 * ===========================================================================
 * The model is sent key names, value *lengths*, a coarse character-class
 * summary, environment names, and ages. It is never sent a value, not even a
 * truncated or masked one.
 *
 * That is not a caution — it is the product. SecureEnv exists because
 * secrets end up in places nobody audits: chat logs, CI output, a Slack
 * thread, someone's `.env` on a laptop. Posting a team's stored secrets to a
 * third-party inference API would reproduce that exact vulnerability, with
 * the added insult of doing it automatically, on every scan, to a vendor the
 * team never chose. A product that leaks the thing it was bought to protect
 * has no defensible reason to exist.
 *
 * So the boundary is enforced three ways, in increasing order of how much
 * they can be trusted:
 *
 *   1. Instruction — the prompt says values are unavailable. Weakest; a
 *      prompt is a suggestion.
 *   2. Structure — buildScanPayload() constructs fresh object literals whose
 *      fields are all *derived* from a value (a length, a boolean), never
 *      the value itself. A value has no field to travel in.
 *   3. Assertion — assertScanPayloadIsSafe() re-checks the finished object
 *      before it is serialised: every field name must be on an allowlist,
 *      and every string anywhere in it must be a key name or an environment
 *      name that already exists in the project. A `value` field added later
 *      fails the first check; a value smuggled under an innocuous field name
 *      fails the second. ai.test.ts pins both.
 *
 * Layer 3 exists because layer 2 is a property of code someone will edit
 * later. This is the most important test in the project after the crypto
 * tests: it is the proof behind the central design claim.
 */

// ---------------------------------------------------------------------------
// The payload
// ---------------------------------------------------------------------------

/**
 * Everything the model is allowed to know about one variable.
 *
 * The phase's list is exhaustive — key name, length, character classes,
 * environment, age — and this type is deliberately not one field wider.
 * The project *name* isn't here either: it isn't on that list, it tells the
 * model nothing it can act on, and every field kept out is a field the
 * assertion below doesn't have to reason about.
 */
export type ScanPayloadVariable = {
  key: string;
  /** Character count of the decrypted value. The value's shadow, not the value. */
  length: number;
  hasDigits: boolean;
  /** Anything outside [A-Za-z0-9] — coarse by design. */
  hasSymbols: boolean;
  looksBase64: boolean;
  looksLikeUrl: boolean;
  /** Whole days since updated_at, or null when the timestamp can't be parsed. */
  ageDays: number | null;
};

export type ScanPayloadEnvironment = {
  environment: string;
  variables: ScanPayloadVariable[];
};

export type ScanPayload = {
  environments: ScanPayloadEnvironment[];
};

/**
 * Field-name allowlists, one per level. Kept as data rather than inlined
 * into the walk so the set of things that may cross the boundary reads as a
 * list someone has to consciously edit.
 */
const PAYLOAD_FIELDS = {
  root: ["environments"],
  environment: ["environment", "variables"],
  variable: [
    "key",
    "length",
    "hasDigits",
    "hasSymbols",
    "looksBase64",
    "looksLikeUrl",
    "ageDays",
  ],
} as const;

/** A hard ceiling on prompt size. A project past this is scanned by rules on every variable and by the model on a prefix — rules are the layer that must never be partial. */
const MAX_PAYLOAD_VARIABLES = 250;

/** Anything shorter is too short to be meaningfully "encoded-looking". */
const MIN_BASE64_LENGTH = 16;

const BASE64_ALPHABET = /^[A-Za-z0-9+/_-]+={0,2}$/;

/** A scheme followed by `://` — `postgres://…`, `https://…`. */
const URL_SHAPE = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Encoded random bytes, roughly. Requires two of the three character classes
 * on top of the alphabet check, so a long lowercase passphrase
 * ("correcthorsebatterystaple") isn't reported as base64 — it is in the
 * alphabet, but it isn't encoded data, and telling the model otherwise would
 * make it reason about the wrong thing.
 */
function looksBase64(value: string): boolean {
  if (value.length < MIN_BASE64_LENGTH) return false;
  if (!BASE64_ALPHABET.test(value)) return false;

  const classes = [/[0-9]/, /[A-Z]/, /[a-z]/].filter((pattern) => pattern.test(value));
  return classes.length >= 2;
}

/**
 * Reduces a decrypted value to the four booleans the model is allowed to see.
 * This function takes plaintext and returns nothing derived from more than
 * its shape — it is the narrowest point in the whole path, and the only
 * place a value is even read on the AI side.
 */
function summarizeCharacterClasses(value: string) {
  return {
    hasDigits: /[0-9]/.test(value),
    hasSymbols: /[^A-Za-z0-9]/.test(value),
    looksBase64: looksBase64(value),
    looksLikeUrl: URL_SHAPE.test(value),
  };
}

/**
 * Raised instead of quietly stripping the offending field. A payload that
 * fails this check means the code that built it is wrong, and the correct
 * response to "we were about to send a secret to a third party" is to stop,
 * not to patch it up and carry on.
 */
export class ScanPayloadLeakError extends Error {
  constructor(detail: string) {
    super(`Refused to send the scan payload to the AI provider: ${detail}`);
    this.name = "ScanPayloadLeakError";
  }
}

function assertOnlyFields(node: unknown, allowed: readonly string[], path: string): void {
  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    throw new ScanPayloadLeakError(`${path} is not an object`);
  }

  for (const field of Object.keys(node)) {
    if (!(allowed as readonly string[]).includes(field)) {
      throw new ScanPayloadLeakError(`${path}.${field} is not an allowed payload field`);
    }
  }
}

/**
 * Every string anywhere in the payload must be a key name or an environment
 * name that already exists in the project being scanned.
 *
 * This is the check that survives a rename. The field allowlist above stops
 * someone adding `value`; this stops them adding `sample`, `hint`, or
 * `preview` and putting a value (or the first eight characters of one) in
 * it, because the result wouldn't be a name.
 *
 * Names are safe to send by the same reasoning audit_logs.metadata already
 * documents in SQL: a key name is a label the team chose, not a credential.
 */
function assertLeavesAreNamesOnly(node: unknown, names: Set<string>, path: string): void {
  if (node === null || typeof node === "number" || typeof node === "boolean") return;

  if (typeof node === "string") {
    if (!names.has(node)) {
      throw new ScanPayloadLeakError(
        `${path} is a string that is not a key or environment name from this project`,
      );
    }
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((item, index) => assertLeavesAreNamesOnly(item, names, `${path}[${index}]`));
    return;
  }

  if (typeof node === "object") {
    for (const [field, child] of Object.entries(node)) {
      assertLeavesAreNamesOnly(child, names, `${path}.${field}`);
    }
    return;
  }

  throw new ScanPayloadLeakError(`${path} has an unexpected type (${typeof node})`);
}

/**
 * The assertion the phase is really about: no decrypted value can be in this
 * payload. Called by buildScanPayload() on the object it just built, and
 * again by runAiScan() immediately before the prompt is assembled — cheap
 * enough to run twice, and the second call covers a payload that came from
 * anywhere other than the builder.
 *
 * Takes the source project because the strongest available statement isn't
 * "no string looks secret", it's "every string is one of *these* names".
 */
export function assertScanPayloadIsSafe(payload: ScanPayload, project: ScanProject): void {
  const names = new Set<string>();
  for (const environment of project.environments) {
    names.add(environment.name);
    for (const variable of environment.variables) names.add(variable.key);
  }

  assertOnlyFields(payload, PAYLOAD_FIELDS.root, "payload");
  if (!Array.isArray(payload.environments)) {
    throw new ScanPayloadLeakError("payload.environments is not an array");
  }

  payload.environments.forEach((environment, index) => {
    const where = `payload.environments[${index}]`;
    assertOnlyFields(environment, PAYLOAD_FIELDS.environment, where);

    if (!Array.isArray(environment.variables)) {
      throw new ScanPayloadLeakError(`${where}.variables is not an array`);
    }

    environment.variables.forEach((variable, variableIndex) => {
      assertOnlyFields(variable, PAYLOAD_FIELDS.variable, `${where}.variables[${variableIndex}]`);
    });
  });

  assertLeavesAreNamesOnly(payload, names, "payload");

  // Belt and braces, and nearly free: Phase 37's own prompt guard over the
  // serialised payload. Subsumed by the check above in every case anyone has
  // thought of — which is exactly why it's worth keeping for the case nobody
  // has.
  if (containsSecretLikeContent(JSON.stringify(payload))) {
    throw new ScanPayloadLeakError("the serialised payload matches a known secret shape");
  }
}

/**
 * Turns a scanned project — which holds decrypted plaintext — into the
 * metadata-only object the model sees, and refuses to return it if it isn't
 * clean.
 */
export function buildScanPayload(project: ScanProject, now: Date = new Date()): ScanPayload {
  let budget = MAX_PAYLOAD_VARIABLES;

  const payload: ScanPayload = {
    environments: project.environments.map((environment) => {
      const included = environment.variables.slice(0, Math.max(0, budget));
      budget -= included.length;

      return {
        environment: environment.name,
        variables: included.map((variable) => ({
          key: variable.key,
          length: variable.value.length,
          ...summarizeCharacterClasses(variable.value),
          ageDays: daysSince(variable.updatedAt, now),
        })),
      };
    }),
  };

  assertScanPayloadIsSafe(payload, project);
  return payload;
}

// ---------------------------------------------------------------------------
// The response
// ---------------------------------------------------------------------------

/**
 * Categories the model may claim. These are the spaces the deterministic
 * rules *don't* occupy — see normalizeAiFindings() for why anything landing
 * in a rule's territory is dropped rather than kept.
 */
const AI_CATEGORIES = ["naming", "consistency", "structure", "exposure", "hygiene", "other"] as const;
type AiCategory = (typeof AI_CATEGORIES)[number];

/** Findings carry `ai-<category>` as their ruleId, so the UI can tell the two layers apart without a second field on Finding. */
export const AI_RULE_PREFIX = "ai-";

export function isAiFinding(finding: Finding): boolean {
  return finding.ruleId.startsWith(AI_RULE_PREFIX);
}

/** Enough for a scanner to be useful; past this the model is padding, the same way Phase 38's generator does. */
const MAX_AI_FINDINGS = 20;
const MESSAGE_MAX_LENGTH = 240;
const FIX_MAX_LENGTH = 300;

/**
 * Deliberately loose where the generator's schema was strict.
 *
 * `severity` and `category` are plain strings, not z.enum, and the whole
 * response is a list. A single row with `"severity": "very high"` would make
 * an enum reject the entire response, costing every other finding in it —
 * a bad trade for a best-effort layer that sits on top of deterministic
 * rules. Unrecognised values are handled per row in normalizeAiFindings()
 * instead, where a bad row can be dropped on its own.
 *
 * As in Phase 38: there is no `value` field, so a model that volunteers one
 * has it stripped at the parse boundary, and normalizeAiFindings() rebuilds
 * every row as a fresh literal regardless.
 */
export const aiScanResponseSchema = z.object({
  findings: z.array(
    z.object({
      environment: z.string(),
      key: z.string(),
      category: z.string(),
      severity: z.string(),
      message: z.string(),
      fix: z.string(),
    }),
  ),
});

export type AiScanResponse = z.infer<typeof aiScanResponseSchema>;

/**
 * Words that mean a finding is about the same thing a given rule already
 * decides deterministically.
 *
 * The category check below handles the honest case — a model that labels a
 * duplicate correctly. This handles the mislabelled one: "JWT_SECRET is only
 * 7 characters, which is too short" filed under `hygiene`. Only consulted
 * when a rule has already fired on that exact variable, so it can't suppress
 * a genuinely new observation about a variable the rules had nothing to say
 * about.
 */
const RULE_TOPICS: Record<string, RegExp> = {
  "short-secret-value": /\b(short|length|characters|entropy|weak|brute)\b/i,
  "live-key-outside-production": /\b(live|sk_live)\b/i,
  "test-key-in-production": /\b(test[- ]?mode|sk_test)\b/i,
  "public-secret-name": /\b(next_public|public|browser|bundle|client[- ]side)\b/i,
  "stale-variable": /\b(stale|rotat\w*|old|age[ds]?|days|unchanged)\b/i,
  "reused-value": /\b(reus\w*|duplicat\w*|identical|shared|same value)\b/i,
  // Deliberately the widest of these: "absent from one environment" has more
  // ordinary phrasings than any other rule's topic, and a live run turned up
  // "appears in staging but not in development" — which an earlier, narrower
  // version of this pattern let straight through.
  "missing-in-environment":
    /\b(missing|absent|lacks?|not (set|defined|present|configured|available|in)|undefined|only (set|defined|present) in)\b/i,
};

const RULE_IDS = new Set(Object.keys(RULE_TOPICS));

/**
 * The two rules that are inherently about a set of environments rather than
 * one (lib/scanner/rules.ts's PROJECT_RULES). Their topics are suppressed
 * per *key across the whole project*, not per (environment, key).
 *
 * A live run is what made this necessary: the rules reported
 * `development.RESEND_API_KEY: missing-in-environment` — anchored, correctly,
 * to the environment that lacks it — and the model reported the identical
 * observation anchored to `production.RESEND_API_KEY`, the environment that
 * has it. Same finding, different end of the same comparison, and a check
 * scoped to one environment could never have caught it.
 */
const PROJECT_LEVEL_RULE_IDS = new Set(["reused-value", "missing-in-environment"]);

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function slugify(text: string): string {
  return collapseWhitespace(text).toLowerCase().replace(/[\s_]+/g, "-");
}

function normalizeSeverity(raw: string): Severity | null {
  const candidate = raw.trim().toLowerCase();
  return (SEVERITY_ORDER as string[]).includes(candidate) ? (candidate as Severity) : null;
}

function normalizeCategory(raw: string): AiCategory {
  const slug = slugify(raw);
  return (AI_CATEGORIES as readonly string[]).includes(slug) ? (slug as AiCategory) : "other";
}

/**
 * Turns a schema-valid response into findings that can be merged with the
 * rule-based ones — dropping, never repairing, anything that doesn't fit.
 * Phase 38 set that precedent for a reason: a repaired suggestion is a guess
 * presented with the same confidence as a fact, and this list is going to be
 * scored and shown as a security posture.
 *
 * A row is dropped when:
 *
 * - it names an environment or key that isn't in the payload. The model was
 *   given the full inventory, so a name that isn't in it is a hallucination,
 *   and a finding nobody can navigate to isn't actionable anyway (Phase 41
 *   deep-links every one of these to its variable).
 * - its severity isn't one of the four. Severity drives the score; an
 *   invented one would move a number the user is meant to trust.
 * - its category is one of the rule ids, or it repeats a rule's topic on a
 *   variable that rule already flagged. **The rules are deterministic and
 *   complete within their categories** — the model can't add to
 *   "is this value under 16 characters", it can only agree or be wrong. This
 *   is the dedupe requirement, and it's structural rather than a fuzzy text
 *   comparison of two sentences.
 * - the message or fix matches a secret shape. `message` and `fix` are the
 *   only free text the model controls, and they render straight onto the
 *   posture panel.
 */
export function normalizeAiFindings(
  response: AiScanResponse,
  payload: ScanPayload,
  ruleFindings: Finding[],
): Finding[] {
  const keysByEnvironment = new Map<string, Set<string>>(
    payload.environments.map((environment) => [
      environment.environment,
      new Set(environment.variables.map((variable) => variable.key)),
    ]),
  );

  // Which rules already fired on which variable, for the topic check —
  // keyed by "environment key" for the per-environment rules, and by the
  // bare key as well for the two that compare environments to each other.
  const rulesByTarget = new Map<string, Set<string>>();

  const remember = (target: string, ruleId: string) => {
    const existing = rulesByTarget.get(target);
    if (existing) existing.add(ruleId);
    else rulesByTarget.set(target, new Set([ruleId]));
  };

  for (const finding of ruleFindings) {
    remember(`${finding.environmentName} ${finding.key}`, finding.ruleId);
    if (PROJECT_LEVEL_RULE_IDS.has(finding.ruleId)) remember(finding.key, finding.ruleId);
  }

  const seen = new Set<string>();
  const findings: Finding[] = [];

  for (const raw of response.findings) {
    if (findings.length >= MAX_AI_FINDINGS) break;

    const environmentName = raw.environment.trim();
    const key = raw.key.trim();
    if (!keysByEnvironment.get(environmentName)?.has(key)) continue;

    const severity = normalizeSeverity(raw.severity);
    if (severity === null) continue;

    const category = normalizeCategory(raw.category);
    if (RULE_IDS.has(slugify(raw.category))) continue;

    const message = collapseWhitespace(raw.message);
    const fix = collapseWhitespace(raw.fix);
    if (!message || !fix) continue;
    if (containsSecretLikeContent(message) || containsSecretLikeContent(fix)) continue;

    const firedRules = new Set([
      ...(rulesByTarget.get(`${environmentName} ${key}`) ?? []),
      ...(rulesByTarget.get(key) ?? []),
    ]);
    if ([...firedRules].some((ruleId) => RULE_TOPICS[ruleId]?.test(message))) {
      continue;
    }

    const ruleId = `${AI_RULE_PREFIX}${category}`;
    const identity = `${environmentName} ${key} ${ruleId}`;
    if (seen.has(identity)) continue;
    seen.add(identity);

    findings.push({
      ruleId,
      severity,
      key,
      environmentName,
      message: message.slice(0, MESSAGE_MAX_LENGTH),
      fix: fix.slice(0, FIX_MAX_LENGTH),
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = [
  "You are a security engineer reviewing a team's environment variable inventory.",
  "You are given metadata only: variable names, value lengths, coarse character-class flags, environment names, and ages.",
  "You never see a value, and you must never guess, invent, quote, or ask for one.",
  "You report only what the metadata supports, and you explain each point in plain language a developer can act on immediately.",
].join(" ");

/**
 * The rule findings go into the prompt as a list of what has already been
 * reported. This is the cooperative half of deduplication — asking the model
 * not to repeat itself is cheaper and produces better output than filtering
 * repetition afterwards, though normalizeAiFindings() still filters, because
 * a prompt is a request and a filter is a guarantee.
 *
 * Rule findings carry no values either (lib/scanner/types.ts), so this adds
 * nothing to the payload's disclosure surface.
 */
export function buildScannerPrompt({
  payload,
  ruleFindings,
}: {
  payload: ScanPayload;
  ruleFindings: Finding[];
}): string {
  const alreadyReported = ruleFindings.length
    ? [
        "Automated rules have already reported these, and they are correct. Do not repeat them or comment on them:",
        ...ruleFindings.map(
          (finding) => `- ${finding.environmentName}.${finding.key}: ${finding.ruleId}`,
        ),
      ].join("\n")
    : "Automated rules found nothing, so everything below is unreported.";

  return [
    "Here is the environment variable inventory for one project. Values are deliberately not included — only their measurements.",
    "```json\n" + JSON.stringify(payload) + "\n```",
    [
      "Field meanings:",
      '- "length": how many characters the value has',
      '- "hasDigits" / "hasSymbols": whether the value contains any digit / any non-alphanumeric character',
      '- "looksBase64": the value is 16+ characters of base64-ish alphabet',
      '- "looksLikeUrl": the value starts with a scheme like https:// or postgres://',
      '- "ageDays": days since the variable was last changed, or null if unknown',
    ].join("\n"),
    alreadyReported,
    [
      "Report risky patterns and naming problems the rules above cannot detect. Good examples of what only you can see:",
      "- a name that misdescribes what it holds, or that a newcomer would misread",
      "- inconsistent naming or prefixes across variables that clearly belong together",
      "- a variable whose measurements do not match what its name implies it holds",
      "- a service credential that appears to be missing its usual companion variable",
      "- an environment whose configuration is structurally out of step with the others",
    ].join("\n"),
    [
      "For each finding, return:",
      '- "environment": exactly one of the environment names above',
      '- "key": exactly one of the variable names above, in that environment',
      `- "category": one of ${AI_CATEGORIES.join(", ")}`,
      '- "severity": one of critical, high, medium, low',
      '- "message": one or two sentences saying what is wrong and why it matters, in plain language',
      '- "fix": one concrete action the developer should take',
    ].join("\n"),
    [
      "Rules:",
      "- Never state, guess, or illustrate what any value is. You do not have them.",
      "- Only report what the metadata actually supports. Do not pad the list; an empty list is a valid answer.",
      `- At most ${MAX_AI_FINDINGS} findings.`,
    ].join("\n"),
    'Return an object of the form {"findings": [...]}.',
  ].join("\n\n");
}

/**
 * The AI layer end to end: project in, extra findings out.
 *
 * No auth, no rate limiting, no database — the same split
 * lib/ai/generator/generate.ts uses, which is what keeps this callable
 * directly from scripts/test-ai-scanner.ts. The server action in Phase 41 is
 * responsible for requireTeamAccess() and enforceAiRateLimit() before it
 * reaches here.
 *
 * Throws whatever callAI() throws, plus ScanPayloadLeakError. Nothing is
 * swallowed here; lib/scanner/scan.ts decides that a failed AI layer
 * degrades to a rules-only scan rather than a failed one.
 */
export async function runAiScan({
  project,
  ruleFindings,
  now = new Date(),
}: {
  project: ScanProject;
  ruleFindings: Finding[];
  now?: Date;
}): Promise<Finding[]> {
  const payload = buildScanPayload(project, now);

  // Built by the line above, so this can only fail if buildScanPayload
  // stopped asserting. That is precisely the regression worth paying a
  // microsecond to catch.
  assertScanPayloadIsSafe(payload, project);

  const response = await callAI({
    prompt: buildScannerPrompt({ payload, ruleFindings }),
    system: SYSTEM_PROMPT,
    schema: aiScanResponseSchema,
  });

  return normalizeAiFindings(response, payload, ruleFindings);
}
