'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search, Sparkles } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useAppStore } from '@/shared/stores/app-store';
import {
  DEFAULT_AGENT_ID,
  filterAgents,
  findChatAgent,
  type ChatAgentId,
} from '@/shared/config/agents/chat-agent-catalog';

/**
 * O seletor de agente, no lugar onde o header do chat dizia só "Assistente".
 *
 * ─── Por que popover próprio, e não DropdownMenu ───
 *
 * O menu do Radix tem typeahead: teclar dentro dele move o foco entre itens, o
 * que briga com uma caixa de busca. O `TopbarClientSwitcher` resolveu isso
 * antes, do mesmo jeito — botão + popover + input —, e este é o mesmo problema
 * um andar abaixo: escolher um item de uma lista que cresce.
 *
 * ⚠️ A lista sai de `chat-agent-catalog`, que é código de propósito: o runtime
 * só instancia os agentes que têm factory (`instance.ts`). Agente criado no AI
 * Studio existe como configuração e não aparece aqui — oferecê-lo prometeria
 * uma resposta que a rota não consegue produzir.
 */
export function AgentPicker({ className }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chatAgentId = useAppStore((s) => s.chatAgentId);
  const setChatAgentId = useAppStore((s) => s.setChatAgentId);
  const agent = findChatAgent(chatAgentId);
  const options = filterAgents(search);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
    else setSearch('');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const outside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', esc);
    };
  }, [isOpen]);

  const choose = (id: ChatAgentId) => {
    setChatAgentId(id);
    setIsOpen(false);
  };

  return (
    <div className={cn('relative min-w-0', className)} ref={ref}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        title={`${agent.name} — ${agent.description}`}
        /* A mesma moldura dos seletores de cliente e de relatório: os três são
           o mesmo gesto — trocar o escopo daquela coluna — e um deles sem
           borda lia como texto, não como controle. */
        className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={1.5} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-foreground">
          {agent.name}
        </span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform', isOpen && 'rotate-180')}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Escolher agente"
          className="absolute left-0 top-full z-50 mt-1 w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" strokeWidth={1.5} aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar agente..."
              aria-label="Buscar agente"
              className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/40"
            />
          </div>

          <div className="max-h-80 overflow-y-auto p-1.5">
            {options.length === 0 ? (
              <p className="px-3 py-4 text-center text-[11px] text-muted-foreground/60">
                Nenhum agente encontrado
              </p>
            ) : (
              options.map((o) => {
                const isActive = o.id === agent.id;
                return (
                  <button
                    key={o.id}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => choose(o.id)}
                    className={cn(
                      'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                      isActive ? 'bg-muted/50' : 'hover:bg-muted/40',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <span className={cn('block truncate text-xs font-medium', isActive ? 'text-foreground' : 'text-foreground/90')}>
                        {o.name}
                      </span>
                      {/* A descrição é o que separa oito especialistas cujos
                          nomes, sozinhos, não dizem para que servem. */}
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground/70">
                        {o.description}
                      </span>
                    </div>
                    {isActive && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2} aria-hidden="true" />}
                  </button>
                );
              })
            )}
          </div>

          {/* Escolher um especialista é abrir mão das tools de autoria — elas
              vivem no supervisor. Dizer isso aqui evita a conclusão errada de
              que o assistente "esqueceu" como montar página. */}
          {agent.id !== DEFAULT_AGENT_ID && (
            <p className="border-t border-border px-3 py-2 text-[10px] leading-snug text-muted-foreground/60">
              Especialistas respondem direto, sem montar ou editar páginas. Para isso,
              volte ao Assistente geral.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
