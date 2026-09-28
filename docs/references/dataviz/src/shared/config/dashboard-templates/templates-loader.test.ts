import { describe, it, expect } from 'vitest';
import { loadDashboardTemplates } from './templates-loader';

describe('loadDashboardTemplates', () => {
  it('retorna catálogo vazio — nenhum template sobreviveu à purga de clientes', () => {
    expect(loadDashboardTemplates()).toEqual([]);
  });
});
