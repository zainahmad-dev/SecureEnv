import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { CreateTeamForm } from "@/components/teams/CreateTeamForm";
import { getFirstTeamSlug } from "@/lib/teams/queries";

export const metadata: Metadata = { title: "Create your team" };

export default async function OnboardingPage() {
  const existingSlug = await getFirstTeamSlug();
  if (existingSlug) {
    redirect(`/teams/${existingSlug}`);
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-ink">Create your team</h1>
      <p className="mb-6 text-sm text-ink/60">
        A team is a shared space where you and your teammates keep your projects&apos;
        environment variables organized and encrypted.
      </p>

      <CreateTeamForm />

      <div className="mt-6 flex justify-center">
        <LogoutButton />
      </div>
    </>
  );
}
