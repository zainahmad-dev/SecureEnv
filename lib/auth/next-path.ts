// Only a single-slash relative path is safe — browsers treat a leading //
// or /\ as protocol-relative, which would redirect off-site.
export function resolveNextPath(value: string | null | undefined): string {
  if (!value) return "/dashboard";
  if (!/^\/(?!\/|\\)/.test(value) || value.includes("://")) {
    return "/dashboard";
  }
  return value;
}
