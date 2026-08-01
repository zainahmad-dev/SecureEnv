import { CopyButton } from "@/components/variables/CopyButton";
import { RevealableValue } from "@/components/variables/RevealableValue";
import { useToast } from "@/components/toast/ToastProvider";
import type { VariableSummary } from "@/lib/variables/queries";

const publicBadgeClass =
  "rounded-full border border-accent-dev/30 bg-accent-dev/10 px-2 py-0.5 text-xs font-medium text-accent-dev";

export function ValueCell({ variable }: { variable: VariableSummary }) {
  if (!variable.isPublic) return <RevealableValue variableId={variable.id} />;

  if (variable.decryptionFailed) {
    return <span className="text-xs text-danger">Could not decrypt this value.</span>;
  }

  return <PublicValueCell value={variable.publicValue ?? ""} />;
}

/**
 * Split out only because copying needs `useToast()`, a hook — a public
 * value is already plaintext and was never an audited "reveal" (Phase 25),
 * so copying it is a plain clipboard write with no network round trip and
 * no new audit_logs row, unlike the secret path in RevealableValue.
 */
function PublicValueCell({ value }: { value: string }) {
  const { showToast } = useToast();

  async function copyValue() {
    await navigator.clipboard.writeText(value);
    showToast("Copied to clipboard", "success");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="truncate rounded bg-card px-2 py-1 font-mono text-xs text-ink">{value}</code>
      <span className={publicBadgeClass}>Public</span>
      <CopyButton onCopy={copyValue} />
    </div>
  );
}
