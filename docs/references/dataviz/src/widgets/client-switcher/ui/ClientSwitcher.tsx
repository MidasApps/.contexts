'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/shared/lib/utils';
import { useAppStore, type ClientConfig } from '@/shared/stores/app-store';
import { useDataFilters } from '@/shared/providers/DataProvider';
import { useUserPermissions } from '@/shared/hooks/useUserPermissions';
import { ChevronDown, Check, Loader2, Search } from 'lucide-react';

interface ClientSwitcherProps {
  collapsed?: boolean;
}

export function ClientSwitcher({ collapsed = false }: ClientSwitcherProps) {
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

  // Filter clients based on permissions (admin sees all)
  const clients = isAdmin
    ? storeClients
    : storeClients.filter((c) => canAccessClient(c.id));

  const activeClient = clients.find((c) => c.id === activeClientId) ?? clients[0] ?? null;

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

  // Focus search on open
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
    if (!open) setSearch('');
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.datasets?.[0]?.dataset ?? '').toLowerCase().includes(search.toLowerCase())
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

  if (!activeClient) {
    const loading = clientsStatus === 'idle' || clientsStatus === 'loading';

    if (collapsed) {
      return (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40">
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/80" strokeWidth={1.5} />
            : <span className="text-sm font-bold text-muted-foreground/80">?</span>
          }
        </div>
      );
    }

    return (
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40">
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/80" strokeWidth={1.5} />
            : <span className="text-sm font-bold text-muted-foreground/80">?</span>
          }
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {loading ? 'Carregando clientes' : 'Nenhum cliente'}
          </p>
          <p className="text-[11px] text-muted-foreground/60">
            {loading ? 'Aguarde...' : 'Verifique a configuração no admin'}
          </p>
        </div>
      </div>
    );
  }

  if (collapsed) {
    return (
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('toggle-nav-collapse'))}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border hover:border-border transition-colors cursor-pointer"
        style={{ backgroundColor: `${activeClient.color}15` }}
        aria-label="Expandir menu"
      >
        <span className="text-base font-bold" style={{ color: activeClient.color }}>
          {activeClient.initial}
        </span>
      </button>
    );
  }

  return (
    <div className="relative flex-1 min-w-0" ref={ref}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 group cursor-pointer w-full min-w-0"
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border"
          style={{ backgroundColor: `${activeClient.color}15` }}
        >
          <span className="text-base font-bold" style={{ color: activeClient.color }}>
            {activeClient.initial}
          </span>
        </div>
        <div className="flex flex-col overflow-hidden flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold tracking-tight text-foreground group-hover:text-foreground transition-colors truncate">
              {activeClient.name}
            </span>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 text-muted-foreground/60 shrink-0 transition-transform',
                open && 'rotate-180'
              )}
              strokeWidth={2}
            />
          </div>
          <p className="text-[11px] text-muted-foreground truncate text-left">{(activeClient.datasets ?? []).map(d => d.name).join(', ')}</p>
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 w-72 rounded-xl border border-border bg-popover shadow-xl overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
            <Search className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" strokeWidth={1.5} />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar empresa..."
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 outline-none"
            />
          </div>

          {/* List */}
          <div className="max-h-64 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-[11px] text-muted-foreground/60">
                Nenhuma empresa encontrada
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
                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
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
                      <span className="text-[10px] text-muted-foreground/60 truncate">{(client.datasets ?? []).map(d => d.name).join(', ')}</span>
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
