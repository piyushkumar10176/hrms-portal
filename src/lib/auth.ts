/**
 * NextAuth.js v5 Configuration
 * 
 * Salesforce-backed authentication.
 * Reads Password_Hash__c from Employee__c for credential verification.
 * No local data store. All auth state lives in SF.
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compareSync } from "bcryptjs";
import { queryOneOrNull } from "./salesforce";

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

        try {
          const emp = await queryOneOrNull<{
            Id: string;
            Official_Email__c: string;
            Password_Hash__c: string;
            First_Name__c: string;
            Last_Name__c: string;
            Employee_Code__c: string;
            Role__c: string;
            Department__c: string;
            Department_Ref__c?: string;
            Department_Ref__r?: { Name: string };
            Employee_Status__c: string;
          }>(`
            SELECT Id, Official_Email__c, Password_Hash__c, First_Name__c, Last_Name__c,
                   Employee_Code__c, Role__c, Department__c, Department_Ref__c, Department_Ref__r.Name, Employee_Status__c
            FROM Employee__c
            WHERE Official_Email__c = '${email.replace(/'/g, "\\'")}'
              AND Employee_Status__c = 'Active'
            LIMIT 1
          `);

          if (!emp || !emp.Password_Hash__c) return null;
          if (!compareSync(password, emp.Password_Hash__c)) return null;

          return {
            id: emp.Id,
            email: emp.Official_Email__c,
            name: `${emp.First_Name__c} ${emp.Last_Name__c}`,
            employeeId: emp.Employee_Code__c,
            role: emp.Role__c?.toLowerCase() || "employee",
            department: emp.Department_Ref__r?.Name || emp.Department__c || "",
            firstName: emp.First_Name__c,
            lastName: emp.Last_Name__c,
          };
        } catch (err) {
          console.error("[Auth] Salesforce login error:", err);
          return null;
        }
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
      if (!token.sub) return session; // Reject sessions without a valid user ID
      session.user.id = token.sub;
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
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
});
