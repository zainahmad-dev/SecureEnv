import { createClient } from "@/lib/supabase/server";
import { hashInviteToken, isWellFormedInviteToken } from "@/lib/invites/token";
import type { CompositeTypes, Enums } from "@/types/database";

export type InvitePreview = CompositeTypes<"invite_preview">;

const INVALID: InvitePreview = {
  status: "invalid",
  team_name: null,
  email: null,
  role: null,
  expires_at: null,
};

/**
 * What the accept-invite page can safely show about a token: which team, which
 * address it was sent to, which role, and whether it's still usable.
 *
 * Runs through the anon/authenticated client on purpose — the visitor may have
 * no account yet. get_invite_preview() is SECURITY DEFINER and executable by
 * anon precisely so this doesn't need the service-role client on a page any
 * stranger with a link can open.
 */
export async function getInvitePreview(token: string): Promise<InvitePreview> {
  if (!isWellFormedInviteToken(token)) return INVALID;

  const supabase = await createClient();
  // No .single() after .rpc(): get_invite_preview returns one composite value,
  // not a set, so the RPC result is already the object (see lib/teams/actions.ts).
  const { data, error } = await supabase.rpc("get_invite_preview", {
    p_token_hash: hashInviteToken(token),
  });

  if (error || !data) return INVALID;

  return data;
}

export type PendingInvite = {
  id: string;
  email: string;
  role: Enums<"team_role">;
  expires_at: string;
  created_at: string;
};

/**
 * Invites that have been neither accepted nor revoked, newest first. Expired
 * ones are included — an admin needs to see a dead invite to clear it, and the
 * UI labels them rather than hiding them.
 *
 * token_hash is never selected: the authenticated role has no privilege on
 * that column (Phase 14 migration), so asking for it fails the whole query.
 */
export async function getPendingInvites(teamId: string): Promise<PendingInvite[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("team_invites")
    .select("id, email, role, expires_at, created_at")
    .eq("team_id", teamId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  return data ?? [];
}
