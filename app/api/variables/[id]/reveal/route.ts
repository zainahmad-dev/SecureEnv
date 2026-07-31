import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { decryptSecret, DecryptionError } from "@/lib/crypto/envelope";
import { createClient } from "@/lib/supabase/server";

// POST, never GET: a GET is prefetchable/crawlable, and every reveal here
// writes a "this was read" audit row below — a link preview or a browser's
// speculative prefetch must never be able to trigger that on its own. Same
// reasoning Phase 14 used for making invite-acceptance POST-only.
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const supabase = await createClient();

  // The RLS SELECT policy on `variables` (member or readonly) is what
  // actually verifies team membership and role before anything is
  // decrypted — a non-member and a genuinely missing id come back
  // identically as "not found", the same indistinguishable-on-purpose
  // pattern getProject/getTeamAccess use elsewhere in this app.
  const { data: variable } = await supabase
    .from("variables")
    .select("id, key, environment_id, encrypted_value, encrypted_dek, iv, auth_tag")
    .eq("id", id)
    .maybeSingle();

  if (!variable) {
    return NextResponse.json({ error: "Variable not found." }, { status: 404 });
  }

  let value: string;
  try {
    value = decryptSecret({
      encryptedValue: variable.encrypted_value,
      encryptedDek: variable.encrypted_dek,
      iv: variable.iv,
      authTag: variable.auth_tag,
    });
  } catch (error) {
    if (error instanceof DecryptionError) {
      console.error(`Failed to decrypt variable ${variable.id} on reveal.`);
    }
    return NextResponse.json({ error: "Could not decrypt this value." }, { status: 500 });
  }

  // Best-effort audit write. lib/audit.ts (Phase 29) is where every mutation
  // site eventually funnels through one shared helper; until then this is
  // a direct insert, using the exact RLS policy Phase 11 already wrote for
  // this ("read" is itself an audited action, any role including readonly
  // may log their own reads). A failure here must never block the reveal
  // itself — the value already decrypted successfully, and the user asked
  // to see it.
  const { data: environment } = await supabase
    .from("environments")
    .select("projects(team_id)")
    .eq("id", variable.environment_id)
    .maybeSingle();
  const teamId = environment?.projects?.team_id;

  if (teamId) {
    const { error: auditError } = await supabase.from("audit_logs").insert({
      team_id: teamId,
      user_id: user.id,
      action: "read",
      target_type: "variable",
      target_id: variable.id,
      environment_id: variable.environment_id,
      // The key name, never the value — matches the non-negotiable rule
      // that metadata must never contain a secret.
      metadata: { key: variable.key },
    });
    if (auditError) {
      console.error(`Failed to write audit log for variable reveal ${variable.id}:`, auditError.message);
    }
  }

  return NextResponse.json({ value }, { headers: { "Cache-Control": "no-store" } });
}
