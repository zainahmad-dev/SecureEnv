/**
 * The generator's input surface: what a user can pick, and how much they can
 * type. Everything here is plain data with no dependency on Zod, the Groq
 * client, or anything server-side — this is the one module in
 * lib/ai/generator/ a client component can import freely, and the picker and
 * the server action that validates it both read from it.
 */

/**
 * Long enough to describe a stack in a sentence or two, short enough that
 * the notes field can't become a channel for pasting a whole .env file in.
 * Enforced in three places that each need it independently: the textarea's
 * maxLength, the server action, and the prompt builder.
 */
export const NOTES_MAX_LENGTH = 500;

/**
 * The multi-select catalogue — exactly the nine services the phase names, in
 * that order.
 *
 * `label` is what the model is told (and what the user sees) — the service's
 * own real name, not a slug, since the whole point is to get the variable
 * names *that vendor's documentation* uses.
 */
export type ServiceOption = {
  /** Stable form value. Never shown to the user, never sent to the model. */
  id: string;
  label: string;
  /** One-line orientation for the checkbox list, not part of the prompt. */
  hint: string;
};

export const SERVICE_OPTIONS: ServiceOption[] = [
  { id: "nextjs", label: "Next.js", hint: "App URL, build-time public config" },
  { id: "stripe", label: "Stripe", hint: "Payments, webhooks" },
  { id: "supabase", label: "Supabase", hint: "Postgres, auth, storage" },
  { id: "resend", label: "Resend", hint: "Transactional email" },
  { id: "cloudinary", label: "Cloudinary", hint: "Image and video hosting" },
  { id: "postgres", label: "Postgres", hint: "A direct database connection" },
  { id: "authjs", label: "Auth.js", hint: "Session and OAuth config" },
  { id: "cloudflare-r2", label: "Cloudflare R2", hint: "S3-compatible object storage" },
  { id: "twilio", label: "Twilio", hint: "SMS and voice" },
];

const BY_ID = new Map(SERVICE_OPTIONS.map((service) => [service.id, service]));

/**
 * Maps submitted ids to their labels, dropping anything unrecognised.
 *
 * The filtering matters more than it looks: these labels are interpolated
 * straight into the prompt, so accepting arbitrary client-supplied strings
 * here would be a prompt-injection surface. Free-form input has exactly one
 * sanctioned channel — the notes field — which is length-capped and runs
 * through the secret guard before any request is sent.
 */
export function resolveServiceLabels(ids: string[]): string[] {
  return ids.map((id) => BY_ID.get(id)?.label).filter((label): label is string => Boolean(label));
}
