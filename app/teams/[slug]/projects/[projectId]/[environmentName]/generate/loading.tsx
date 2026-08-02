// The parent [environmentName] segment's loading.tsx would otherwise apply
// here, and it mirrors that page's two-column grid — a skeleton that resolves
// into this page's single narrow column instead. Same idea as that file, just
// shaped like what actually arrives.
export default function GenerateVariablesLoading() {
  return (
    <div className="p-6 min-[900px]:p-8">
      <div className="flex max-w-3xl flex-col gap-6">
        <div className="h-8 w-56 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
        <div className="h-12 w-full animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
        <div className="h-44 w-full animate-pulse rounded-lg bg-ink/10 motion-reduce:animate-none" />
        <div className="h-24 w-full animate-pulse rounded-lg bg-ink/10 motion-reduce:animate-none" />
      </div>
    </div>
  );
}
