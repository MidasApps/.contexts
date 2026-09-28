import { describe, it, expect } from 'vitest';
import { normalizeRoute } from '../normalize-route';

describe('normalizeRoute', () => {
  it('colapsa reports dinâmicos para /g (paridade com routeForMetric)', () => {
    expect(normalizeRoute('/g/covenants/r/visao-executiva')).toBe('/g');
    expect(normalizeRoute('/g')).toBe('/g');
  });
  it('preserva qualquer outro caminho intacto', () => {
    expect(normalizeRoute('/dashboard')).toBe('/dashboard');
    expect(normalizeRoute('/explore')).toBe('/explore');
    expect(normalizeRoute('/')).toBe('/');
    // Caminho de dois segmentos: só `/g/...` colapsa, o resto passa direto.
    expect(normalizeRoute('/admin/templates')).toBe('/admin/templates');
  });

  // `/graficos` começa com "/g" mas NÃO é report dinâmico. Colapsá-lo daria a
  // quem tem `/g` o acesso a uma rota que ninguém liberou.
  it('não confunde prefixo textual com o segmento /g', () => {
    expect(normalizeRoute('/graficos')).toBe('/graficos');
  });
});
