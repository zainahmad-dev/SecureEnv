import { logOut } from "@/lib/auth/actions";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

export function LogoutButton() {
  return (
    <form action={logOut}>
      <button
        type="submit"
        className={`rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-card ${focusRing}`}
      >
        Log out
      </button>
    </form>
  );
}
