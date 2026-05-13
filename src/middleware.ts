import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Public routes — accessible without authentication
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth") || pathname.startsWith("/setup-password") || pathname.startsWith("/api/setup-password") || pathname.startsWith("/api/webhook") || pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname === "/manifest.json" || pathname.startsWith("/icons") || pathname === "/sw.js") {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin-only routes
  const isAdminRoute = pathname.startsWith("/admin") || 
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
    
    if (req.auth?.user?.role !== "admin" && !isException) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)"],
};
