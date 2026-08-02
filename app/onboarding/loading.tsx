// onboarding/layout.tsx already supplies the CenteredCard chrome.
export default function OnboardingLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-6 w-40 animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
      <div className="h-4 w-full animate-pulse rounded bg-ink/10 motion-reduce:animate-none" />
      <div className="h-9 w-full animate-pulse rounded-lg bg-ink/10 motion-reduce:animate-none" />
      <div className="h-9 w-full animate-pulse rounded-lg bg-ink/20 motion-reduce:animate-none" />
    </div>
  );
}
