// Bare, not wrapped in AppShell — same convention as every loading.tsx in
// this app (see the audit log's own loading.tsx for the original reasoning).
export default function TeamDashboardLoading() {
  return (
    <div className="flex flex-col gap-6 p-6 min-[900px]:p-8">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-56 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
        <div className="h-4 w-40 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
      </div>
      <div className="h-5 w-40 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
      <div className="h-9 w-24 animate-pulse rounded-lg bg-ink/10 motion-reduce:animate-none" />
    </div>
  );
}
