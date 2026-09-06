import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";
import { toRole, isHrOrAdmin, isAdmin } from "@/lib/authz";

// Next.js 16 renamed the middleware file convention to `proxy`. While running as
// `src/middleware.ts` this file was compiled but never executed, so every page and
// API route was served without the authentication and admin checks below.
const { auth: withAuth } = NextAuth(authConfig);

export const proxy = withAuth((req) => {
  const { pathname } = req.nextUrl;

  // Public routes: accessible without a session. /api/slack is public because
  // Slack authenticates itself by signing each request, which the routes verify
  // before reading the payload.
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth") || pathname.startsWith("/setup-password") || pathname.startsWith("/api/setup-password") || pathname.startsWith("/forgot-password") || pathname.startsWith("/api/forgot-password") || pathname.startsWith("/reset-password") || pathname.startsWith("/api/reset-password") || pathname.startsWith("/api/webhook") || pathname.startsWith("/api/slack") || pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname === "/manifest.json" || pathname.startsWith("/icons") || pathname === "/sw.js") {
    return NextResponse.next();
  }

  const isApiRoute = pathname.startsWith("/api/");

  // Unauthenticated: API callers get JSON, browsers get the login page.
  // Redirecting an API route would hand the caller an HTML document.
  if (!req.auth) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin-only routes
  const isAdminRoute = pathname.startsWith("/admin") || 
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/employees") ||
    pathname.startsWith("/api/salary");
  
  if (isAdminRoute) {
    // Exceptions — accessible to any authenticated user:
    // - /admin/employees (My Team page)
    // - /api/employees (fetch team list)
    // - /api/employees/me (own profile)
    // - /api/employees/[id] GET (view profile — route itself does auth)
    const isException = pathname === "/admin/employees" || 
      pathname === "/api/employees" || 
      pathname.endsWith("/me") ||
      (pathname.match(/^\/api\/employees\/[^/]+$/) && req.method === "GET");
    
    const actor = { id: req.auth?.user?.id ?? "", role: toRole(req.auth?.user?.role) };

    // /api/salary and the admin pages are configuration, so admin only.
    // Everything else behind the admin gate is HR-visible company data.
    const adminOnly = pathname.startsWith("/admin/") || pathname.startsWith("/api/admin");
    const permitted = adminOnly ? isAdmin(actor) : isHrOrAdmin(actor);

    if (!permitted && !isException) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.next();
});

export default proxy;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)"],
};
