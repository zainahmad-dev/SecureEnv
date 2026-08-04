import { redirect } from "next/navigation";

// Not a real page — the root route renders nothing of its own and exists
// only to send a visitor to the login screen, which is where every entry
// into this app begins. Same shape as app/dashboard/page.tsx: a route that
// resolves onward, kept in the App Router with the rest of the app's
// routing rather than hidden in a next.config redirect.
//
// The redirect is unconditional, so `/` is not a session-dependent branch:
// a signed-in visitor lands on /login too, where the existing session still
// carries them onward as it does from any other entry point.
//
// force-dynamic is load-bearing, not boilerplate. A redirect can only be an
// HTTP status code if the response hasn't started yet, and two separate
// things here would otherwise start it early — both degrading this into
// `<meta http-equiv="refresh" content="1;url=/login">`, a full second of
// blank page before the browser moves:
//
//   1. This component touches no dynamic API, so without force-dynamic Next
//      prerenders it at build time, and a static HTML file has no status
//      line to put a redirect in. It also shipped with `Cache-Control:
//      s-maxage=31536000` — a year of that meta tag.
//   2. A `loading.tsx` beside this file wraps the route in a Suspense
//      boundary, so Next streams the fallback shell before the redirect
//      resolves and the status is committed by then. This route
//      deliberately has none; there is no content here to skeleton, and
//      every other route in the app defines its own.
//
// Verified as a real 307 with a Location header, not a meta refresh.
export const dynamic = "force-dynamic";

export default function RootPage() {
  redirect("/login");
}
