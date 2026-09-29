import { describe, it, expect } from 'vitest';
import { routeForMetric, REPORT_ROUTE } from '../metric-route-map';
import { normalizeRoute } from '../normalize-route';

/**
 * G1 (path semântico) — rota exigida para executar uma métrica, para
 * enforcement server-side de `canAccessRoute` no `executeMetric`.
 *
 * Este arquivo mudou de forma junto com o módulo. Antes ele afirmava que uma
 * lista de 64 ids `covenants.*` mapeava para `/g` e que o resto devolvia
 * `null` — ou seja, testava a ALLOWLIST. O que a allowlist produzia era duas
 * coisas indesejadas: catálogo de produto em código (métrica é gerenciada pela
 * admin, em banco) e gate de rota perdido em silêncio para quem não estivesse
 * nela.
 */
describe('routeForMetric', () => {
  it('toda métrica exige a rota de relatório — é a única superfície que executa métrica', () => {
    for (const id of [
      'covenants.indice_recebivel',
      'covenants.mapa_vendas_table',
      'chat.preco_medio_por_m2',      // criada pelo usuário via chat
      'qualquer.coisa',               // cadastrada pela admin depois deste deploy
    ]) {
      expect(routeForMetric(id)).toBe(REPORT_ROUTE);
    }
  });

  // O ponto do R5: métrica fora de uma lista fixa perdia o gate de rota e
  // sobrava só o de tenant. Cadastrar métrica pela admin não pode abrir buraco.
  it('métrica desconhecida NÃO fica sem gate de rota', () => {
    expect(routeForMetric('metrica.que.ninguem.cadastrou')).not.toBeNull();
  });

  it('nenhum nome de produto decide a rota', () => {
    expect(routeForMetric('covenants.x')).toBe(routeForMetric('outroproduto.x'));
  });

  // As duas pontas do gate têm que casar: o cliente checa por pathname
  // (ProtectedRoute → normalizeRoute) e o servidor por routeForMetric. Se
  // divergirem, o usuário vê a página e recebe 403 nos dados — ou o contrário.
  it('casa com o que o cliente checa para um report dinâmico', () => {
    expect(normalizeRoute('/g/covenants/r/visao-executiva')).toBe(routeForMetric('qualquer.metrica'));
  });
});
