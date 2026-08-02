import { z } from "zod";
import { containsSecretLikeContent } from "@/lib/ai/guard";
import { isPublicKey, validateKey } from "@/lib/variables/key";

/**
 * What the model is allowed to hand back, and what happens to it afterwards.
 *
 * The single most important thing in this file is a field that isn't here:
 * there is no `value`. The phase's rule is "values are entered by the user
 * only — the LLM never generates a secret value", and this schema is where
 * that becomes structural rather than aspirational. Zod objects strip
 * unknown keys, so a model that volunteers `"value": "sk_live_…"` anyway
 * has it dropped at the parse boundary; normalizeSuggestions() then rebuilds
 * every row as a fresh literal, so nothing the model sent can survive except
 * the four fields named below. lib/ai/generator/schema.test.ts pins that.
 *
 * Pure — no server imports — so it can be unit-tested and shared with the
 * client component that renders the checklist.
 */

/** A hard ceiling on how much one generation can return. Nine services with a handful of variables each lands well under this; anything past it is the model padding. */
export const MAX_SUGGESTIONS = 40;

const DESCRIPTION_MAX_LENGTH = 160;
const SERVICE_MAX_LENGTH = 40;

export const generatorResponseSchema = z.object({
  variables: z.array(
    z.object({
      key: z.string(),
      /** Which of the requested services this variable belongs to — used only to group the checklist. */
      service: z.string(),
      description: z.string(),
      visibility: z.enum(["public", "secret"]),
    }),
  ),
});

export type GeneratorResponse = z.infer<typeof generatorResponseSchema>;

export type SuggestedVariable = {
  key: string;
  service: string;
  description: string;
  visibility: "public" | "secret";
};

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Turns a schema-valid response into the list the UI actually renders:
 * uppercase keys, anything the app's own key rules would reject dropped,
 * duplicates removed, and descriptions sanitised.
 *
 * Dropping rather than repairing an invalid key is deliberate. A suggestion
 * is only useful if it's the name that service's own documentation uses —
 * "fixing" `stripe-secret-key` into `STRIPE_SECRET_KEY` would be a guess
 * dressed up as a recommendation, and the user can always type it by hand.
 *
 * Two smaller judgment calls:
 *
 * - A NEXT_PUBLIC_ key is forced to "public" regardless of what the model
 *   claimed. That prefix isn't a label, it's Next.js inlining the value into
 *   the browser bundle at build time; a row saying "secret" next to it would
 *   be actively misleading about what the user is agreeing to.
 * - A description matching one of the guard's secret shapes is blanked, not
 *   kept. A model asked to name variables shouldn't be producing example
 *   keys at all, but `description` is the one free-text field it controls,
 *   and rendering `e.g. sk_live_…` in a field sitting next to a value input
 *   is exactly the habit this product exists to break.
 */
export function normalizeSuggestions(response: GeneratorResponse): SuggestedVariable[] {
  const seen = new Set<string>();
  const suggestions: SuggestedVariable[] = [];

  for (const raw of response.variables) {
    if (suggestions.length >= MAX_SUGGESTIONS) break;

    const key = raw.key.trim().toUpperCase();
    if (validateKey(key) !== null) continue;
    if (seen.has(key)) continue;
    seen.add(key);

    const description = collapseWhitespace(raw.description);

    suggestions.push({
      key,
      service: collapseWhitespace(raw.service).slice(0, SERVICE_MAX_LENGTH),
      description: containsSecretLikeContent(description)
        ? ""
        : description.slice(0, DESCRIPTION_MAX_LENGTH),
      visibility: isPublicKey(key) ? "public" : raw.visibility,
    });
  }

  return suggestions;
}
