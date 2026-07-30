import Link from "next/link";
import { environmentAccentClasses, environmentPurpose } from "@/lib/environments/presentation";
import type { EnvironmentSummary } from "@/lib/environments/queries";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

/**
 * These are real links (each one navigates to its own URL, per Phase 19's
 * "reflect the selection in the URL" requirement), styled as tabs — not a
 * client-side panel switcher. So this deliberately skips the full WAI-ARIA
 * tab pattern's roving tabindex: every tab stays individually reachable by
 * Tab like any other link, which is what a keyboard user actually expects
 * from navigation. role="tablist"/"tab" and aria-selected are what Phase 19
 * asks for explicitly; a full accessibility pass is Phase 36's job.
 */
export function EnvironmentTabs({
  teamSlug,
  projectId,
  environments,
  activeName,
}: {
  teamSlug: string;
  projectId: string;
  environments: EnvironmentSummary[];
  activeName: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Environments"
      className="flex gap-1 overflow-x-auto border-b border-line"
    >
      {environments.map((env) => {
        const isActive = env.name === activeName;
        const accent = environmentAccentClasses(env.name);
        const purpose = environmentPurpose(env.name);

        return (
          <Link
            key={env.id}
            href={`/teams/${teamSlug}/projects/${projectId}/${env.name}`}
            role="tab"
            aria-selected={isActive}
            className={`flex shrink-0 flex-col gap-0.5 whitespace-nowrap border-b-2 px-4 py-2.5 ${focusRing} ${
              isActive ? accent.border : "border-transparent hover:bg-card"
            }`}
          >
            <span
              className={`flex items-center gap-2 text-sm font-medium capitalize ${
                isActive ? "text-ink" : "text-ink/70"
              }`}
            >
              <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${accent.dot}`} />
              {env.name}
              <span className="font-normal text-ink/40">{env.variableCount}</span>
            </span>
            {purpose && <span className="text-xs text-ink/50">{purpose}</span>}
          </Link>
        );
      })}
    </div>
  );
}
