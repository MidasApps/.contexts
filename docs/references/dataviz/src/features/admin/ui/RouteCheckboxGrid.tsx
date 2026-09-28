'use client';

import { ALL_ROUTES } from '@/features/admin/model/types';
import { cn } from '@/shared/lib/utils';

interface RouteCheckboxGridProps {
  selected: string[];
  onChange: (routes: string[]) => void;
}

/**
 * Grupos DERIVADOS de ALL_ROUTES, não uma lista paralela.
 *
 * Era literal (`['Carteira','Risco','Operacional','Anexos','IA','Reports']`) e
 * saiu de sincronia quando as rotas fixas do Play foram removidas: "Risco" e
 * "Operacional" ficaram sem nenhuma rota, renderizando cabeçalho vazio com um
 * "Selecionar todos" que não fazia nada (grupo sem paths → `every` devolve
 * true → o botão travava em "Desmarcar todos"). Derivando, isso não repete.
 */
export const ROUTE_GROUPS = [...new Set(ALL_ROUTES.map((r) => r.group))] as readonly string[];

export function RouteCheckboxGrid({ selected, onChange }: RouteCheckboxGridProps) {
  const groupedRoutes = ROUTE_GROUPS.map((group) => ({
    group,
    routes: ALL_ROUTES.filter((r) => r.group === group),
  })).filter((g) => g.routes.length > 0);

  const handleToggleGroup = (group: string, routes: readonly { path: string }[]) => {
    const groupPaths = routes.map((r) => r.path);
    const allSelected = groupPaths.every((p) => selected.includes(p));
    if (allSelected) {
      onChange(selected.filter((p) => !groupPaths.includes(p)));
    } else {
      const newSelected = [...selected];
      for (const path of groupPaths) {
        if (!newSelected.includes(path)) newSelected.push(path);
      }
      onChange(newSelected);
    }
  };

  const handleToggleRoute = (path: string) => {
    if (selected.includes(path)) {
      onChange(selected.filter((p) => p !== path));
    } else {
      onChange([...selected, path]);
    }
  };

  return (
    <div className="space-y-4">
      {groupedRoutes.map(({ group, routes }) => {
        const groupPaths = routes.map((r) => r.path);
        const allSelected = groupPaths.every((p) => selected.includes(p));

        return (
          <div key={group} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {group}
              </span>
              <button
                type="button"
                onClick={() => handleToggleGroup(group, routes)}
                className="text-[11px] text-primary hover:text-primary/80 transition-colors"
              >
                {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {routes.map((route) => {
                const isChecked = selected.includes(route.path);
                return (
                  <label
                    key={route.path}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                      isChecked
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-border bg-muted/40 hover:bg-muted/50'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleRoute(route.path)}
                      className="sr-only"
                    />
                    <div
                      className={cn(
                        'size-3.5 rounded flex items-center justify-center border flex-shrink-0',
                        isChecked
                          ? 'bg-primary border-primary'
                          : 'border-border bg-transparent'
                      )}
                    >
                      {isChecked && (
                        <svg className="size-2.5 text-black" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className={cn('text-xs', isChecked ? 'text-foreground' : 'text-muted-foreground')}>
                      {route.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
