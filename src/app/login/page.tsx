"use client";

import { signIn } from "next-auth/react";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Turnstile } from "@/components/auth/turnstile";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const router = useRouter();
  const handleToken = useCallback((token: string) => setCaptchaToken(token), []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email, password, captchaToken, redirect: false,
    });

    if (result?.error) {
      // Deliberately identical whether the address is unknown, the password is
      // wrong, or the account is locked. Saying which would let someone learn
      // who works here and whether they have guessed a real address.
      setError("That email and password combination did not work. After several failed attempts an account is locked for 15 minutes.");
      setCaptchaToken("");
    } else {
      router.push("/dashboard");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left — Gradient Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 items-center justify-center p-12">
        <div className="text-white max-w-md">
          <h1 className="text-4xl font-bold mb-4">HRMS Portal</h1>
          <p className="text-lg opacity-80 mb-8">Manage your team, attendance, leaves, and more — all in one place.</p>
          <div className="space-y-4 text-sm opacity-70">
            <div className="flex items-center gap-3"><span className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">🕐</span> Clock In/Out with GPS</div>
            <div className="flex items-center gap-3"><span className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">🏖️</span> Leave Management</div>
            <div className="flex items-center gap-3"><span className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">📊</span> Attendance Reports</div>
            <div className="flex items-center gap-3"><span className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">🔔</span> Real-time Notifications</div>
          </div>
        </div>
      </div>

      {/* Right — Login Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">H</div>
            <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
            <p className="text-gray-500 mt-1">Sign in to the HRMS portal</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="you@cloudsheer.com" autoComplete="username"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <Link href="/forgot-password" className="text-sm text-indigo-600 hover:text-indigo-700 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="Enter password" autoComplete="current-password"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            </div>

            <Turnstile onToken={handleToken} />

            {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            No account yet? Your invitation is sent by email when HR adds you.
          </p>
        </div>
      </div>
    </div>
  );
}
