// Mirrors the real page's two-column grid (Phase 31) at the same
// min-[1024px] breakpoint, so resolving from skeleton to real content
// doesn't jump the activity panel from below the fold to a side column.
export default function EnvironmentLoading() {
  return (
    <div className="p-6 min-[900px]:p-8">
      <div className="grid grid-cols-1 gap-6 min-[1024px]:grid-cols-[minmax(0,1fr)_18rem] min-[1024px]:items-start">
        <div className="flex flex-col gap-6">
          <div className="h-8 w-48 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
          <div className="h-10 w-full max-w-md animate-pulse rounded-lg bg-ink/10 motion-reduce:animate-none" />
          <div className="h-64 w-full animate-pulse rounded-lg bg-ink/10 motion-reduce:animate-none" />
          <div className="h-40 w-full animate-pulse rounded-lg bg-ink/10 motion-reduce:animate-none" />
        </div>
        <div className="h-72 w-full animate-pulse rounded-lg bg-ink/10 motion-reduce:animate-none" />
      </div>
    </div>
  );
}
