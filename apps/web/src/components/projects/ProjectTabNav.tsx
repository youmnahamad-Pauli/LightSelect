'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface Tab {
  label: string;
  href: string;
}

function tabs(id: string): Tab[] {
  return [
    { label: 'Overview',        href: `/projects/${id}/overview` },
    { label: 'Documents',       href: `/projects/${id}/documents` },
    { label: 'Schedule',        href: `/projects/${id}/schedule` },
    { label: 'Categories',      href: `/projects/${id}/categories` },
    { label: 'Files',           href: `/projects/${id}/files` },
    { label: 'Products',        href: `/projects/${id}/products` },
    { label: 'Spec',            href: `/projects/${id}/spec` },
    { label: 'BOQ',             href: `/projects/${id}/boq` },
    { label: 'Checklist',       href: `/projects/${id}/checklist` },
    { label: 'Package Preview', href: `/projects/${id}/preview` },
    { label: 'Exports',         href: `/projects/${id}/exports` },
  ];
}

export function ProjectTabNav({ id }: { id: string }) {
  const pathname = usePathname();

  return (
    <div className="border-b border-border bg-surface px-6">
      <nav className="-mb-px flex gap-0 overflow-x-auto">
        {tabs(id).map(({ label, href }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-ink-muted hover:border-border hover:text-ink',
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
