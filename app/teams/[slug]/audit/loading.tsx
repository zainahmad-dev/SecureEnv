// Next.js's own Suspense-based loading convention — shown automatically
// while the async page below is still fetching, no client JS of its own.
// Not wrapped in AppShell: no page in this app persists the shell across a
// navigation (every page.tsx wraps itself independently), so a bare
// skeleton here is consistent with how every other route already behaves
// mid-navigation, not a one-off simplification.
export default function AuditLogLoading() {
  return (
    <div className="flex flex-col gap-6 p-6 min-[900px]:p-8">
      <div className="h-8 w-48 animate-pulse rounded bg-ink/10" />
      <div className="h-20 w-full animate-pulse rounded-lg bg-ink/10" />
      <div className="h-96 w-full animate-pulse rounded-lg bg-ink/10" />
    </div>
  );
}
