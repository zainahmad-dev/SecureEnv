import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

// /invite/<token> has to render for someone with no account at all — that's
// the whole point of an invitation. The page shows nothing without a valid
// token, and accepting still requires a session (enforced in
// accept_team_invite, not here).
// /api/demo/reset (Phase 43) is public to the middleware because a Vercel
// Cron invocation carries no user session — but it is not unauthenticated:
// the route itself requires a CRON_SECRET bearer token and refuses every
// request when that variable is unset.
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/auth/callback",
  "/api/health",
  "/api/demo/reset",
  "/invite",
];

/**
 * The marketing landing page (Phase 44), matched exactly and never as a
 * prefix.
 *
 * It cannot go in PUBLIC_PATHS above: that list is prefix-matched, and
 * `"/".startsWith("/")` is true for *every* path in the application — one
 * entry would silently make the entire app public, with no error and no
 * failing page to notice it by. Kept as its own exact-match set so that
 * trap can't be reintroduced by someone adding a route here later.
 */
const PUBLIC_EXACT_PATHS = new Set(["/"]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT_PATHS.has(pathname)) return true;
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
