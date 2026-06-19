'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useProducts } from '@/hooks/use-products';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { ProductFormModal } from '@/components/products/ProductFormModal';
import { STANDARD_ATTRIBUTES } from '@/components/products/AttributeEditor';
import { useProjectContext } from '@/context/project-context';
import type { ProductListItem, ProductWithDetails } from '@/types';

const TOTAL_STANDARD = STANDARD_ATTRIBUTES.length;

function statusVariant(status: string) {
  switch (status) {
    case 'approved': return 'success' as const;
    case 'reviewed': return 'info' as const;
    default:         return 'neutral' as const;
  }
}

function sourceVariant(source: string) {
  return source === 'pdf_extract' ? 'info' as const : 'neutral' as const;
}

function CompletenessBar({ filled, total }: { filled: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((filled / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-brand'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-500">{filled}/{total}</span>
    </div>
  );
}

const columns: Column<ProductListItem>[] = [
  {
    key: 'model',
    header: 'Product',
    render: (r) => (
      <div>
        <p className="font-medium text-slate-900">{r.model_number ?? <span className="text-slate-400 italic">No model number</span>}</p>
        {r.manufacturer && <p className="text-xs text-slate-500">{r.manufacturer}</p>}
        {r.family_name && <p className="text-xs text-slate-400">{r.family_name}</p>}
      </div>
    ),
  },
  {
    key: 'category',
    header: 'Category',
    render: (r) => r.category_name ?? <span className="text-slate-400">—</span>,
  },
  {
    key: 'status',
    header: 'Status',
    width: '90px',
    render: (r) => <Badge variant={statusVariant(r.status)}>{r.status}</Badge>,
  },
  {
    key: 'source',
    header: 'Source',
    width: '90px',
    render: (r) => (
      <Badge variant={sourceVariant(r.source_type)}>
        {r.source_type === 'pdf_extract' ? 'Extracted' : r.source_type === 'import' ? 'Import' : 'Manual'}
      </Badge>
    ),
  },
  {
    key: 'completeness',
    header: 'Attributes',
    width: '110px',
    render: (r) => <CompletenessBar filled={r.filled_attribute_count} total={TOTAL_STANDARD} />,
  },
];

export default function ProjectProductsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { project } = useProjectContext();
  const { products, loading, addProduct } = useProducts(params.id);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Products</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Structured product records for this project. Add attributes manually or import from extracted PDFs.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Product
        </Button>
      </div>

      <Card>
        <DataTable<ProductListItem>
          columns={columns}
          rows={products}
          rowKey={(r) => r.id}
          loading={loading}
          onRowClick={(r) => router.push(`/projects/${params.id}/products/${r.id}`)}
          empty="No products yet. Add a product to start entering specifications."
        />
      </Card>

      <ProductFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        projectId={params.id}
        onSuccess={(p) => {
          addProduct(p);
          setCreateOpen(false);
          router.push(`/projects/${params.id}/products/${p.id}`);
        }}
      />
    </div>
  );
}
