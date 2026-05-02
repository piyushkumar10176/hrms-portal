"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email, password, redirect: false,
    });

    if (result?.error) {
      setError("Invalid credentials. Check demo accounts below.");
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
            <p className="text-gray-500 mt-1">Sign in to your account</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="admin@example.com"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="Enter password"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            </div>

            {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="mt-6 bg-gray-50 rounded-lg p-4 text-xs text-gray-500">
            <p className="font-medium text-gray-700 mb-2">Demo Accounts:</p>
            <p><strong>Admin:</strong> admin@example.com / admin123</p>
            <p><strong>Employee:</strong> priya@example.com / emp123</p>
            <p><strong>Employee:</strong> rahul@example.com / emp123</p>
          </div>
        </div>
      </div>
    </div>
  );
}
