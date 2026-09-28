'use client';
import { useEffect, useState } from 'react';
import { fetchTools } from '../model/api';
import type { ToolDescriptor } from '@/features/ai-studio/tools-manifest';

export function ToolsCatalog() {
  const [tools, setTools] = useState<ToolDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetchTools().then(setTools).finally(() => setLoading(false)); }, []);
  if (loading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{tools.length} tools (read-only — definidas em código).</p>
      <div className="rounded-lg border border-border divide-y divide-border">
        {tools.map((t) => (
          <div key={t.key} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{t.name}</span>
              <code className="text-[11px] text-muted-foreground">{t.key}</code>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{t.category}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
