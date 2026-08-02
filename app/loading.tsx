// Same convention as every other loading.tsx in this app: bare, not wrapped
// in AppShell — no page here persists the shell across a navigation, so a
// skeleton without one matches how the app already behaves mid-navigation.
export default function HomeLoading() {
  return (
    <div className="flex flex-col items-center gap-8 p-6 py-8 min-[900px]:p-8">
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-40 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
        <div className="h-4 w-64 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
      </div>
      <div className="h-48 w-full max-w-sm animate-pulse rounded-xl bg-ink/10 motion-reduce:animate-none" />
    </div>
  );
}
