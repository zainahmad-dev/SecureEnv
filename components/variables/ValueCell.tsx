import { RevealableValue } from "@/components/variables/RevealableValue";
import type { VariableSummary } from "@/lib/variables/queries";

const publicBadgeClass =
  "rounded-full border border-accent-dev/30 bg-accent-dev/10 px-2 py-0.5 text-xs font-medium text-accent-dev";

export function ValueCell({ variable }: { variable: VariableSummary }) {
  if (!variable.isPublic) return <RevealableValue variableId={variable.id} />;

  if (variable.decryptionFailed) {
    return <span className="text-xs text-danger">Could not decrypt this value.</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="truncate rounded bg-card px-2 py-1 font-mono text-xs text-ink">
        {variable.publicValue}
      </code>
      <span className={publicBadgeClass}>Public</span>
    </div>
  );
}
