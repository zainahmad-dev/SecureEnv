export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

  return slug || "team";
}

// Static segments under /teams/ (app/teams/new/page.tsx as of Phase 16) take
// routing priority over the dynamic /teams/[slug] page. A team literally
// named "New" would otherwise slugify to a slug that's permanently
// unreachable — masked by that static route rather than colliding with the
// database's uniqueness constraint, which wouldn't catch this at all.
const RESERVED_SLUGS = new Set(["new"]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

export function withRandomSuffix(slug: string): string {
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slug}-${suffix}`;
}
