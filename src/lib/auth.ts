/**
 * NextAuth.js v5 Configuration
 * 
 * Supports: Credentials login (email/password from mock data)
 * Roles: admin, employee (stored in JWT token)
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "./mock-data";

declare module "next-auth" {
  interface User {
    employeeId?: string;
    role?: string;
    department?: string;
    firstName?: string;
    lastName?: string;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      employeeId: string;
      role: string;
      department: string;
      image?: string;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    employeeId?: string;
    role?: string;
    department?: string;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        const password = credentials?.password as string;

        if (!email || !password) return null;

        const employee = db.authenticate(email, password);
        if (!employee) return null;

        return {
          id: employee.id,
          email: employee.email,
          name: `${employee.firstName} ${employee.lastName}`,
          employeeId: employee.employeeId,
          role: employee.role,
          department: employee.department,
          firstName: employee.firstName,
          lastName: employee.lastName,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.employeeId = user.employeeId;
        token.role = user.role;
        token.department = user.department;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub || "";
      session.user.employeeId = (token.employeeId as string) || "";
      session.user.role = (token.role as string) || "employee";
      session.user.department = (token.department as string) || "";
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  trustHost: true,
  secret: process.env.AUTH_SECRET || "fallback_secret_for_vercel_testing_only_123456789",
});
