'use client';
import { type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

interface Props {
  count: number; total: number; loading: boolean; error: string | null;
  createLabel: string; onCreate: () => void;
  search: string; onSearch: (v: string) => void;
  children: ReactNode;
}

export function AiStudioListShell({ count, total, loading, error, createLabel, onCreate, search, onSearch, children }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? 'Carregando...' : `${count} de ${total}`}
        </p>
        <Button size="sm" onClick={onCreate} className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5">
          <Plus className="size-3.5" /> {createLabel}
        </Button>
      </div>
      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</div>}
      <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Buscar por id ou nome..." className="max-w-md" />
      {children}
    </div>
  );
}
