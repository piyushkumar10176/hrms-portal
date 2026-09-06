/**
 * NextAuth.js v5 Configuration
 * 
 * Salesforce-backed authentication.
 * Reads Password_Hash__c from Employee__c for credential verification.
 * No local data store. All auth state lives in SF.
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { queryOneOrNull, updateRecord } from "./salesforce";
import { escapeSoqlString } from "./soql";
import { verifyCaptcha } from "./captcha";
import { authConfig } from "./auth.config";

/** Consecutive failures before the account is locked. */
const MAX_FAILED_ATTEMPTS = 5;
/** How long a locked account stays locked. */
const LOCKOUT_MINUTES = 15;

declare module "next-auth" {
  interface User {
    employeeId?: string;
    passwordChangedAt?: string;
    role?: string;
    department?: string;
    firstName?: string;
    lastName?: string;
  }
  interface Session {
    user: {
      id: string;
      passwordChangedAt?: string;
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
    passwordChangedAt?: string;
    role?: string;
    department?: string;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        captchaToken: { label: "Captcha", type: "text" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        const password = credentials?.password as string;

        if (!email || !password) return null;

        // Verified before any database work, so a bot cannot use the login form
        // to probe which addresses exist. Inert until Turnstile is configured.
        const captcha = await verifyCaptcha(credentials?.captchaToken as string | undefined);
        if (!captcha.ok) {
          console.warn("[auth] captcha rejected:", captcha.reason);
          return null;
        }

        try {
          // Strict email regex to prevent SOQL injection
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(email)) return null;

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
            Failed_Login_Attempts__c?: number | null;
            Lockout_Until__c?: string | null;
            Password_Changed_At__c?: string | null;
          }>(`
            SELECT Id, Official_Email__c, Password_Hash__c, First_Name__c, Last_Name__c,
                   Employee_Code__c, Role__c, Department__c, Department_Ref__c, Department_Ref__r.Name,
                   Employee_Status__c, Failed_Login_Attempts__c, Lockout_Until__c, Password_Changed_At__c
            FROM Employee__c
            WHERE Official_Email__c = '${escapeSoqlString(email)}'
              AND Employee_Status__c = 'Active'
            LIMIT 1
          `);

          if (!emp || !emp.Password_Hash__c) return null;

          // Account lockout. Login was previously unthrottled, so a password could
          // be guessed at whatever rate the attacker could issue requests. The
          // counter lives in Salesforce rather than in memory because serverless
          // instances are short-lived and do not share state.
          if (emp.Lockout_Until__c && new Date(emp.Lockout_Until__c) > new Date()) {
            return null;
          }

          const isValid = await compare(password, emp.Password_Hash__c);

          if (!isValid) {
            const attempts = (emp.Failed_Login_Attempts__c ?? 0) + 1;
            const update: Record<string, unknown> = { Failed_Login_Attempts__c: attempts };
            if (attempts >= MAX_FAILED_ATTEMPTS) {
              update.Lockout_Until__c = new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString();
              update.Failed_Login_Attempts__c = 0;
            }
            try {
              await updateRecord("Employee__c", emp.Id, update);
            } catch (recordErr) {
              console.error("[Auth] Could not record failed attempt:", recordErr);
            }
            return null;
          }

          // Record the sign-in, and clear any lockout counters it succeeded past.
          try {
            await updateRecord("Employee__c", emp.Id, {
              Failed_Login_Attempts__c: 0,
              Lockout_Until__c: null,
              Last_Login_At__c: new Date().toISOString(),
            });
          } catch (recordErr) {
            console.error("[Auth] Could not record the sign-in:", recordErr);
          }

          return {
            id: emp.Id,
            email: emp.Official_Email__c,
            name: `${emp.First_Name__c} ${emp.Last_Name__c}`,
            employeeId: emp.Employee_Code__c,
            role: emp.Role__c?.toLowerCase() || "employee",
            department: emp.Department_Ref__r?.Name || emp.Department__c || "",
            firstName: emp.First_Name__c,
            lastName: emp.Last_Name__c,
            passwordChangedAt: emp.Password_Changed_At__c ?? undefined,
          };
        } catch (err) {
          console.error("[Auth] Salesforce login error:", err);
          return null;
        }
      },
    }),
  ],
});
