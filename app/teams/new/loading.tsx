export default function NewTeamLoading() {
  return (
    <div className="flex max-w-sm flex-col gap-3 p-6 min-[900px]:p-8">
      <div className="h-6 w-32 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
      <div className="h-4 w-full animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
      <div className="h-9 w-full animate-pulse rounded-lg bg-ink/10 motion-reduce:animate-none" />
      <div className="h-9 w-full animate-pulse rounded-lg bg-ink/20 motion-reduce:animate-none" />
    </div>
  );
}
