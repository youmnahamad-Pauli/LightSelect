'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Flame } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Alert } from '@/components/ui/alert';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.auth.login(email, password);
      login(data.token, data.user, data.organization);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ backgroundColor: '#1E1612' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Flame className="h-5 w-5 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold" style={{ color: '#F3EEE8' }}>
              LightSelect
            </h1>
            <p className="mt-1 text-sm" style={{ color: '#A89D91' }}>
              Sign in to your workspace
            </p>
          </div>
        </div>

        {/* Form card */}
        <div
          className="rounded-xl border p-6"
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderColor: 'rgba(255,255,255,0.08)',
          }}
        >
          {error && (
            <div className="mb-4">
              <Alert variant="error">{error}</Alert>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-medium"
                style={{ color: '#A89D91' }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="block w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  borderColor: 'rgba(255,255,255,0.12)',
                  color: '#F3EEE8',
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-medium"
                style={{ color: '#A89D91' }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="block w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  borderColor: 'rgba(255,255,255,0.12)',
                  color: '#F3EEE8',
                }}
              />
            </div>

            <div className="pt-1">
              <Button
                type="submit"
                loading={loading}
                className="w-full justify-center"
              >
                Sign in
              </Button>
            </div>
          </form>
        </div>

        <p className="mt-6 text-center text-xs" style={{ color: '#6B5D52' }}>
          LightSelect · Lighting submittal packages
        </p>
      </div>
    </div>
  );
}
