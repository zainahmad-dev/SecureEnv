import { NextResponse } from "next/server";
import { requireTeamAccess } from "@/lib/auth/team-access";
import { auditRowsToCsv } from "@/lib/audit/csv";
import {
  AUDIT_ACTIONS,
  getAuditLogExportRows,
  type AuditAction,
  type AuditLogFilters,
} from "@/lib/audit/queries";

export const dynamic = "force-dynamic";

function isAuditAction(value: string | null): value is AuditAction {
  return value !== null && (AUDIT_ACTIONS as readonly string[]).includes(value);
}

function paramOrUndefined(value: string | null): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

/**
 * A plain `<a href>` navigation, not a fetch — file downloads need a real
 * URL the browser can navigate to for Content-Disposition to trigger a
 * save, so this is GET. That's safe here in a way it wouldn't be for a
 * mutation: exporting has no state-changing side effect and isn't itself
 * an audited action, so there's nothing a prefetcher could trigger that
 * matters.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId") ?? "";

  if (!teamId) {
    return NextResponse.json({ error: "Missing teamId." }, { status: 400 });
  }

  // Same read access the audit log page itself requires (RLS's own
  // "readonly" minimum on audit_logs) — an export can't show a reader
  // anything the page wouldn't already.
  const access = await requireTeamAccess(
    teamId,
    "readonly",
    "You don't have access to this team's audit log.",
  );
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }

  const actionParam = searchParams.get("action");
  const filters: AuditLogFilters = {
    userId: paramOrUndefined(searchParams.get("user")),
    action: isAuditAction(actionParam) ? actionParam : undefined,
    environmentId: paramOrUndefined(searchParams.get("environment")),
    dateFrom: paramOrUndefined(searchParams.get("from")),
    dateTo: paramOrUndefined(searchParams.get("to")),
  };

  const rows = await getAuditLogExportRows(teamId, filters);
  const csv = auditRowsToCsv(rows);
  const filename = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
