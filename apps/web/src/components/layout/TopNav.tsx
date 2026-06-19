'use client';

import { useRouter } from 'next/navigation';
import { LogOut, ChevronDown, Building2 } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { api } from '@/lib/api-client';
import { useState } from 'react';

interface TopNavProps {
  title?: string;
}

export function TopNav({ title }: TopNavProps) {
  const { user, organization, token, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    if (token) {
      try { await api.auth.logout(token); } catch { /* ignore */ }
    }
    logout();
    router.push('/login');
  }

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-6">
      {title && (
        <h1 className="text-sm font-semibold text-ink">{title}</h1>
      )}
      {!title && <div />}

      {/* Org + User */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-ink hover:bg-surface-hover transition-colors"
        >
          {organization && (
            <span className="flex items-center gap-1.5 text-ink-muted text-xs border-r border-border pr-3 mr-1">
              <Building2 className="h-3.5 w-3.5" />
              <span className="max-w-[120px] truncate">{organization.name}</span>
            </span>
          )}
          <span className="h-7 w-7 rounded-full bg-primary-soft text-primary text-xs font-semibold flex items-center justify-center shrink-0">
            {initials}
          </span>
          <span className="max-w-[120px] truncate text-ink">{user?.full_name}</span>
          <ChevronDown className="h-3.5 w-3.5 text-ink-faint" />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-20 w-52 rounded-xl border border-border bg-surface shadow-modal py-1 text-sm">
              <div className="px-3.5 py-2.5 border-b border-border/60">
                <p className="font-medium text-ink truncate">{user?.full_name}</p>
                <p className="text-xs text-ink-faint truncate mt-0.5">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3.5 py-2.5 text-ink-muted hover:bg-surface-hover hover:text-danger transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
