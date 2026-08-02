// /dashboard never actually renders content of its own — it's a pure
// redirect (see page.tsx) — so unlike every other loading.tsx here, there's
// no page shape worth skeletoning. A brief spinner is enough; it should
// never be visible for more than the one query the redirect target needs.
export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <div
        aria-label="Loading"
        className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent motion-reduce:animate-none"
      />
    </div>
  );
}
