// Same reasoning as /dashboard's loading.tsx — this route is a pure
// redirect to the project's first environment (see page.tsx), nothing of
// its own to skeleton.
export default function ProjectRedirectLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <div
        aria-label="Loading"
        className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent motion-reduce:animate-none"
      />
    </div>
  );
}
