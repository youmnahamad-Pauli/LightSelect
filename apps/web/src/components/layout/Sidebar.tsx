'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderOpen,
  Tag,
  FileText,
  Package,
  Settings,
  Flame,
  SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects', href: '/projects', icon: FolderOpen },
  { label: 'Matching', href: '/matching', icon: SlidersHorizontal },
  { label: 'Categories', href: '/categories', icon: Tag },
  { label: 'Templates', href: '/templates', icon: FileText },
  { label: 'Exports', href: '/exports', icon: Package },
];

const bottomItems = [
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col bg-sidebar-bg">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-4 border-b border-sidebar-border">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
          <Flame className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-sidebar-text-active tracking-tight">
          LightSelect
        </span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-sidebar-active text-sidebar-text-active font-medium'
                  : 'text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active',
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0',
                  active ? 'text-sidebar-text-active' : 'text-sidebar-text',
                )}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom nav */}
      <div className="px-2.5 py-3 border-t border-sidebar-border space-y-0.5">
        {bottomItems.map(({ label, href, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-sidebar-active text-sidebar-text-active font-medium'
                  : 'text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
