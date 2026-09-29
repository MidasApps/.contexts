'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useAppStore, type ClientConfig } from '@/shared/stores/app-store';
import { useDataFilters } from '@/shared/providers/DataProvider';
import { useUserPermissions } from '@/shared/hooks/useUserPermissions';

/**
 * ClientSwitcher compacto — a pílula da topbar e o bloco do topo da sidebar.
 *
 * A variante `bloco` existe porque o cliente é o escopo de TUDO que a coluna
 * lista: os relatórios abaixo dele são os DAQUELE cliente. Numa pílula solta
 * na topbar essa relação não se lê; no topo da coluna, sim — é a mesma razão
 * pela qual o seletor de organização das ferramentas de referência mora ali.
 *
 * Mantém toda lógica do ClientSwitcher original (filtros por permissão,
 * preservação de filtros por cliente, busca).
 */
export function TopbarClientSwitcher({ variant = 'pilula' }:{ variant?: 'pilula' | 'bloco' }) {
  const block = variant === 'bloco';
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeClientId = useAppStore((s) => s.activeClientId);
  const switchClient = useAppStore((s) => s.switchClient);
  const getFiltersForClient = useAppStore((s) => s.getFiltersForClient);
  const storeClients = useAppStore((s) => s.clients);
  const clientsStatus = useAppStore((s) => s.clientsStatus);
  const { isAdmin, canAccessClient } = useUserPermissions();

  const clients = isAdmin
    ? storeClients
    : storeClients.filter((c) => canAccessClient(c.id));

  const activeClient = storeClients.find((c) => c.id === activeClientId) ?? storeClients[0] ?? null;

  // Auto-select first accessible client if current is inaccessible
  useEffect(() => {
    if (clients.length > 0 && !clients.some((c) => c.id === activeClientId)) {
      const first = clients[0];
      switchClient(first.id, { dateRange: { start: '', end: '' }, compareEnabled: false });
    }
  }, [clients, activeClientId, switchClient]);

  let ctx: ReturnType<typeof useDataFilters> | null = null;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- hook opcional em try/catch (fail-soft fora do <Provider>)
  try { ctx = useDataFilters(); } catch {}

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
    if (!open) setSearch('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
    || (c.dataset?.toLowerCase().includes(search.toLowerCase()) ?? false),
  );

  const handleSwitch = (client: ClientConfig) => {
    if (client.id === activeClientId) {
      setOpen(false);
      return;
    }
    if (ctx) {
      switchClient(client.id, { dateRange: ctx.dateRange, compareEnabled: ctx.compareEnabled });
      const saved = getFiltersForClient(client.id);
      ctx.setDateRange(saved.dateRange);
      ctx.setCompareEnabled(saved.compareEnabled);
    } else {
      switchClient(client.id, { dateRange: { start: '', end: '' }, compareEnabled: false });
    }
    setOpen(false);
  };

  const loading = clientsStatus === 'idle' || clientsStatus === 'loading';

  if (!activeClient) {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 border border-border bg-muted/40 text-[11px] font-medium text-muted-foreground/80',
          block ? 'w-full rounded-lg px-2.5 py-2' : 'shrink-0 rounded-full px-3 py-1.5',
        )}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
        ) : (
          <span>—</span>
        )}
        <span className="hidden sm:inline">{loading ? 'Carregando…' : 'Nenhum cliente'}</span>
      </div>
    );
  }

  return (
    <div className={cn('relative', block ? 'w-full' : 'shrink-0')} ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 border border-border bg-muted/40 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/50 hover:text-foreground',
          block ? 'w-full rounded-lg p-1.5' : 'rounded-full py-1 pl-1 pr-3',
        )}
        title={`Cliente: ${activeClient.name}`}
      >
        <span
          className={cn(
            'flex shrink-0 items-center justify-center text-[10px] font-bold text-black',
            block ? 'h-7 w-7 rounded-md' : 'h-6 w-6 rounded-full',
          )}
          style={{ backgroundColor: activeClient.color }}
        >
          {activeClient.initial}
        </span>
        {/* Na coluna o rótulo é dispensável: o que está acima da lista de
            relatórios do cliente só pode ser o cliente. */}
        {!block && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80">Cliente</span>
        )}
        <span
          className={cn(
            'truncate font-semibold tracking-tight',
            block ? 'flex-1 text-left text-[12px]' : 'max-w-[140px]',
          )}
        >
          {activeClient.name}
        </span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 text-muted-foreground/80 shrink-0 transition-transform', open && 'rotate-180')}
          strokeWidth={1.5}
        />
      </button>

      {open && (
        <div
          className={cn(
            'absolute top-full left-0 z-50 mt-2 overflow-hidden rounded-xl border border-border bg-popover shadow-xl',
            block ? 'w-full' : 'w-72',
          )}
        >
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
            <Search className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" strokeWidth={1.5} />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-[11px] text-muted-foreground/60">
                Nenhum cliente encontrado
              </p>
            ) : (
              filtered.map((client) => {
                const isActive = client.id === activeClientId;
                return (
                  <button
                    key={client.id}
                    onClick={() => handleSwitch(client)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                      isActive
                        ? 'bg-muted/50 text-foreground'
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                    )}
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-black"
                      style={{ backgroundColor: client.color }}
                    >
                      {client.initial}
                    </div>
                    <div className="flex flex-col flex-1 min-w-0 text-left">
                      <span className="text-xs font-medium truncate">{client.name}</span>
                      {client.dataset && (
                        <span className="text-[10px] text-muted-foreground/60 truncate">{client.dataset}</span>
                      )}
                    </div>
                    {isActive && <Check className="h-3.5 w-3.5 text-primary shrink-0" strokeWidth={2} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
