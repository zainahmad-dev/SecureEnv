import { ACTION_LABELS, describeAuditTarget, targetTypeLabel } from "@/lib/audit/presentation";
import type { AuditLogRow } from "@/lib/audit/queries";

const CSV_HEADERS = ["Timestamp", "Actor", "Action", "Target type", "Target", "Environment", "Metadata"];

function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Metadata is already sanitised before it's ever written (lib/audit.ts's
 * runtime guard) — this only re-serialises what's already safe to log, it
 * doesn't add a second layer of stripping.
 */
export function auditRowsToCsv(rows: AuditLogRow[]): string {
  const lines = [CSV_HEADERS.map(escapeCsvField).join(",")];

  for (const row of rows) {
    const actor = row.actorDisplayName ?? row.actorEmail ?? (row.actorId ? "Former member" : "");
    const fields = [
      row.createdAt,
      actor,
      ACTION_LABELS[row.action],
      targetTypeLabel(row.targetType),
      describeAuditTarget(row) ?? "",
      row.environmentName ?? "",
      row.metadata ? JSON.stringify(row.metadata) : "",
    ];
    lines.push(fields.map((field) => escapeCsvField(field)).join(","));
  }

  // CRLF per the CSV spec (RFC 4180), not just \n.
  return lines.join("\r\n");
}
