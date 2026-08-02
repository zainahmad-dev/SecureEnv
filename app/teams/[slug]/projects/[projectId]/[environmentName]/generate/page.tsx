import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EnvGenerator } from "@/components/ai/EnvGenerator";
import { AppShell } from "@/components/shell/AppShell";
import { getProjectEnvironments } from "@/lib/environments/queries";
import { environmentAccentVar } from "@/lib/environments/presentation";
import { getProject } from "@/lib/projects/queries";
import { getSidebarData } from "@/lib/shell/sidebar-data";
import { getTeamAccess } from "@/lib/teams/queries";
import { getEnvironmentVariables } from "@/lib/variables/queries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; projectId: string; environmentName: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  const project = await getProject(projectId);
  return { title: project ? `Generate variables · ${project.name}` : "Generate variables" };
}

export default async function GenerateVariablesPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string; environmentName: string }>;
}) {
  const { slug, projectId, environmentName } = await params;

  const access = await getTeamAccess(slug);
  if (!access) notFound();

  const { team, role } = access;

  const project = await getProject(projectId);
  if (!project || project.teamId !== team.id) notFound();

  const [sidebar, environments] = await Promise.all([
    getSidebarData(team.id),
    getProjectEnvironments(project.id),
  ]);

  const current = environments.find((env) => env.name === environmentName);
  if (!current) notFound();

  const backHref = `/teams/${team.slug}/projects/${project.id}/${current.name}`;

  // Same "member" threshold as adding a variable by hand — a readonly member
  // couldn't save anything the generator produced, so the honest thing is to
  // say so rather than let them spend the team's AI quota discovering it.
  // Explained rather than 404'd, matching the project settings screen.
  if (role === "readonly") {
    return (
      <AppShell
        breadcrumb={[team.name, project.name, current.name, "Generate"]}
        sidebar={sidebar}
        envAccentVar={environmentAccentVar(current.name)}
      >
        <div className="flex max-w-2xl flex-col gap-4">
          <h1 className="text-2xl font-semibold text-ink">Generate variables</h1>
          <p className="text-sm text-ink/60">
            Only team admins and members can add variables to an environment.
          </p>
          <Link href={backHref} className="text-sm text-accent underline decoration-dotted">
            Back to {current.name}
          </Link>
        </div>
      </AppShell>
    );
  }

  // Key names only — getEnvironmentVariables() decrypts nothing but
  // NEXT_PUBLIC_ values, and none of what it returns is passed to the
  // generator. This is here purely so the checklist can mark a suggestion as
  // already present instead of letting the save fail on a duplicate.
  const variables = await getEnvironmentVariables(current.id);

  return (
    <AppShell
      breadcrumb={[team.name, project.name, current.name, "Generate"]}
      sidebar={sidebar}
      envAccentVar={environmentAccentVar(current.name)}
    >
      <div className="flex max-w-3xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Link
            href={backHref}
            className="self-start text-sm text-ink/60 underline decoration-dotted hover:text-ink"
          >
            ← Back to {current.name}
          </Link>

          <h1 className="text-2xl font-semibold text-ink">Generate variables</h1>
          <p className="max-w-2xl text-ink/60">
            Pick the services this project uses and SecureEnv will ask an AI model which environment
            variables they need. It returns <strong className="font-medium text-ink">names only</strong> —
            you fill in the values, and they are encrypted before they are stored, exactly like any
            variable you add by hand.
          </p>
        </div>

        <EnvGenerator
          environmentId={current.id}
          projectId={project.id}
          teamId={team.id}
          teamSlug={team.slug}
          environmentName={current.name}
          existingKeys={variables.map((variable) => variable.key)}
        />
      </div>
    </AppShell>
  );
}
