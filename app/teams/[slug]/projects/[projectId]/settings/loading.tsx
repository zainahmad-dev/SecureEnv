export default function ProjectSettingsLoading() {
  return (
    <div className="flex flex-col gap-8 p-6 min-[900px]:p-8">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-48 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
        <div className="h-4 w-32 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
      </div>
      <div className="flex max-w-lg flex-col gap-3">
        <div className="h-9 w-full animate-pulse rounded-lg bg-ink/10 motion-reduce:animate-none" />
        <div className="h-9 w-full animate-pulse rounded-lg bg-ink/10 motion-reduce:animate-none" />
      </div>
      <div className="h-24 w-full max-w-lg animate-pulse rounded-lg bg-ink/10 motion-reduce:animate-none" />
    </div>
  );
}
