import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    // Eight hours rather than the thirty day default: a shared or unattended
    // machine should not stay signed in to HR data for a month.
    maxAge: 60 * 60 * 8,
    updateAge: 60 * 15,
  },
  trustHost: true,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  providers: [], // we add credentials in auth.ts
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.employeeId = user.employeeId as string;
        token.role = user.role as string;
        token.department = user.department as string;
        // Recorded so a later password change can invalidate this token.
        token.passwordChangedAt = (user as { passwordChangedAt?: string }).passwordChangedAt;
      }
      return token;
    },
    async session({ session, token }) {
      if (!token.sub) return session;
      session.user.id = token.sub;
      session.user.employeeId = (token.employeeId as string) || "";
      session.user.role = (token.role as string) || "employee";
      session.user.department = (token.department as string) || "";
      session.user.passwordChangedAt = token.passwordChangedAt as string | undefined;
      return session;
    },
  },
} satisfies NextAuthConfig;
