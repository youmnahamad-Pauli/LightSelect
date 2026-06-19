'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useCategories } from '@/hooks/use-categories';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { CreateCategoryModal } from '@/components/categories/CreateCategoryModal';
import type { Category } from '@/types';

const columns: Column<Category>[] = [
  {
    key: 'name',
    header: 'Category',
    render: (r) => <span className="font-medium text-slate-900">{r.name}</span>,
  },
  {
    key: 'type',
    header: 'Type',
    render: (r) => (
      <Badge variant={r.is_system_defined ? 'info' : 'default'}>
        {r.is_system_defined ? 'System' : 'Custom'}
      </Badge>
    ),
  },
  {
    key: 'parent',
    header: 'Parent',
    render: (r) => r.parent_name ?? <span className="text-slate-400">—</span>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (r) => (
      <Badge variant={r.is_active ? 'success' : 'neutral'}>
        {r.is_active ? 'Active' : 'Archived'}
      </Badge>
    ),
  },
];

export default function CategoriesPage() {
  const router = useRouter();
  const { categories, loading, reload } = useCategories();
  const [createOpen, setCreateOpen] = useState(false);

  const customCount = categories.filter((c) => !c.is_system_defined).length;
  const systemCount = categories.filter((c) => c.is_system_defined).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Categories</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Every uploaded file must be assigned to a category.
            {!loading && (
              <span className="ml-1">
                {systemCount} system · {customCount} custom
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Create Category
        </Button>
      </div>

      <Card>
        <DataTable<Category>
          columns={columns}
          rows={categories}
          rowKey={(r) => r.id}
          loading={loading}
          onRowClick={(r) => !r.is_system_defined && router.push(`/categories/${r.id}`)}
          empty="No categories found. Run the seed script to load system categories, or create a custom one."
        />
      </Card>

      <CreateCategoryModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={reload}
      />
    </div>
  );
}
