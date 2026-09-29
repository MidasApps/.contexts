import { describe, it, expect } from 'vitest';
import { ALL_ROUTES } from '@/features/admin/model/types';
import { ROUTE_GROUPS } from '@/features/admin/ui/RouteCheckboxGrid';

describe('RouteCheckboxGrid grantability', () => {
  it('renderiza TODOS os grupos presentes em ALL_ROUTES (nenhuma rota órfã)', () => {
    const grupos = [...new Set(ALL_ROUTES.map((r) => r.group))];
    for (const g of grupos) expect(ROUTE_GROUPS).toContain(g);
  });
  it('/g é concedível', () => {
    expect(ALL_ROUTES.some((r) => r.path === '/g')).toBe(true);
  });
});
