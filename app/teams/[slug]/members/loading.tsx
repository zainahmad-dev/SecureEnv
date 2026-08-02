export default function MembersLoading() {
  return (
    <div className="flex flex-col gap-8 p-6 min-[900px]:p-8">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-40 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
        <div className="h-4 w-64 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
      </div>
      <div className="h-24 w-full max-w-xl animate-pulse rounded-lg bg-ink/10 motion-reduce:animate-none" />
      <div className="h-64 w-full animate-pulse rounded-lg bg-ink/10 motion-reduce:animate-none" />
      <div className="h-20 w-full animate-pulse rounded-lg bg-ink/10 motion-reduce:animate-none" />
    </div>
  );
}
