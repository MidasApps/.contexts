import { describe, it, expect, vi } from 'vitest';
import {
  serializePageFilters,
  parsePageFiltersFromSearch,
  substituteReportTokens,
} from './drill-through';

describe('serializePageFilters', () => {
  it('retorna string vazia para valores vazios', () => {
    expect(serializePageFilters({})).toBe('');
  });

  it('serializa uma chave com múltiplos valores como pf.<attr>=v1,v2 (URL-encoded)', () => {
    const qs = serializePageFilters({ 'transacoes.banco_codigo': ['001', '237'] });
    expect(qs).toBe('pf.transacoes.banco_codigo=001%2C237');
  });

  it('ignora chaves com array vazio ou ausente', () => {
    const qs = serializePageFilters({ banco: [], categoria: ['Taxas'] });
    expect(qs).toBe('pf.categoria=Taxas');
  });

  it('serializa múltiplas chaves separadas por &', () => {
    const qs = serializePageFilters({ banco: ['001'], categoria: ['Taxas', 'Outros'] });
    expect(qs).toBe('pf.banco=001&pf.categoria=Taxas%2COutros');
  });

  it('encoda espaços e acentos de forma consistente com o parser', () => {
    const qs = serializePageFilters({ categoria: ['Taxa de Administração'] });
    const parsed = new URLSearchParams(qs);
    expect(parsed.get('pf.categoria')).toBe('Taxa de Administração');
  });
});

describe('parsePageFiltersFromSearch', () => {
  it('retorna objeto vazio quando searchParams é nulo/indefinido', () => {
    expect(parsePageFiltersFromSearch(null)).toEqual({});
    expect(parsePageFiltersFromSearch(undefined)).toEqual({});
  });

  it('extrai pares pf.<attr>=v1,v2 em arrays', () => {
    const sp = new URLSearchParams('pf.transacoes.banco_codigo=001%2C237&edit=1');
    expect(parsePageFiltersFromSearch(sp)).toEqual({
      'transacoes.banco_codigo': ['001', '237'],
    });
  });

  it('ignora pares fora do namespace pf.', () => {
    const sp = new URLSearchParams('edit=1&other=x');
    expect(parsePageFiltersFromSearch(sp)).toEqual({});
  });

  it('faz o round-trip com serializePageFilters (attribute com ponto, valores com espaço/acento)', () => {
    const original = {
      'transacoes.banco_codigo': ['001', '237'],
      categoria: ['Taxa de Administração'],
    };
    const qs = serializePageFilters(original);
    const parsed = parsePageFiltersFromSearch(new URLSearchParams(qs));
    expect(parsed).toEqual(original);
  });
});

describe('substituteReportTokens', () => {
  it('substitui {groupId} e {pageFilters}', () => {
    const result = substituteReportTokens(
      'Link: [Extrato →](/g/{groupId}/r/abc?{pageFilters})',
      { groupId: 'grp-1', pageFilters: 'pf.banco=001' },
    );
    expect(result).toBe('Link: [Extrato →](/g/grp-1/r/abc?pf.banco=001)');
  });

  it('resolve {report:<templateId>} via resolveReportId', () => {
    const resolveReportId = vi.fn((templateId: string) =>
      templateId === 'covenants-v2-extrato-detalhado' ? 'report-xyz' : undefined,
    );
    const result = substituteReportTokens(
      '[Extrato Detalhado →](/g/{groupId}/r/{report:covenants-v2-extrato-detalhado}?{pageFilters})',
      { groupId: 'grp-1', pageFilters: 'pf.banco=001', resolveReportId },
    );
    expect(result).toBe('[Extrato Detalhado →](/g/grp-1/r/report-xyz?pf.banco=001)');
    expect(resolveReportId).toHaveBeenCalledWith('covenants-v2-extrato-detalhado');
  });

  it('mantém o token literal quando o report não é encontrado (soft failure)', () => {
    const result = substituteReportTokens(
      '[X →](/g/{groupId}/r/{report:inexistente})',
      { groupId: 'grp-1', pageFilters: '', resolveReportId: () => undefined },
    );
    expect(result).toBe('[X →](/g/grp-1/r/{report:inexistente})');
  });

  it('mantém o token literal quando resolveReportId não é fornecido', () => {
    const result = substituteReportTokens(
      '{report:algum-template}',
      { groupId: 'g', pageFilters: '' },
    );
    expect(result).toBe('{report:algum-template}');
  });

  it('não altera conteúdo sem tokens', () => {
    const result = substituteReportTokens('Texto simples sem tokens.', {
      groupId: 'g',
      pageFilters: '',
    });
    expect(result).toBe('Texto simples sem tokens.');
  });

  it('é segura para conteúdo vazio', () => {
    expect(substituteReportTokens('', { groupId: 'g', pageFilters: '' })).toBe('');
  });
});
