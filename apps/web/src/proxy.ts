import { NextResponse, type NextRequest } from "next/server";

import { SESSION_HINT_COOKIE } from "@/lib/api/http";

/**
 * Optimistic route guard: visitors with no session cookie at all go straight
 * to /login instead of loading the app shell first. It never authorizes
 * anything. The API checks every request, and the client-side AuthGate
 * handles expired sessions.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_HINT_COOKIE)) return NextResponse.next();

  const url = request.nextUrl.clone();
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/boards/:path*", "/settings/:path*"],
};
