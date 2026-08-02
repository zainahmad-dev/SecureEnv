// Nested inside (auth)/layout.tsx's CenteredCard, which already provides
// the brand header and card chrome — this only needs to skeleton the card's
// own contents (title, two fields, a button).
export default function LoginLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-6 w-24 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
      <div className="h-9 w-full animate-pulse rounded-lg bg-ink/10 motion-reduce:animate-none" />
      <div className="h-9 w-full animate-pulse rounded-lg bg-ink/10 motion-reduce:animate-none" />
      <div className="h-9 w-full animate-pulse rounded-lg bg-ink/20 motion-reduce:animate-none" />
    </div>
  );
}
