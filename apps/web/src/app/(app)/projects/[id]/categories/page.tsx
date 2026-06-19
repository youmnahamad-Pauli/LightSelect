import { Tag } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function ProjectCategoriesPage() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="rounded-xl bg-slate-100 p-4 text-slate-400">
          <Tag className="h-8 w-8" />
        </div>
        <p className="font-medium text-slate-700">Categories</p>
        <p className="max-w-sm text-sm text-slate-400">
          Category management is available in Priority 4. You will be able to assign system and
          custom categories to your project files here.
        </p>
      </CardContent>
    </Card>
  );
}
