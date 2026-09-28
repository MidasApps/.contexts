/**
 * O contrato do módulo, independente de quem grava.
 *
 * Os dois chamadores (rota admin e chat) têm seus próprios testes de
 * comportamento; aqui ficam as regras da lista em si — o que entra, o que não
 * entra, e a diferença entre declaração inexistente e declaração quebrada.
 */
import { describe, it, expect } from 'vitest';
import { preservedFromPrevious } from './preserve-fields';

const DECLARATION = { banco: { expr: 'b.nome_reduzido', field: 'banco', label: 'Banco' } };

describe('preservedFromPrevious', () => {
  it('carrega a declaração de filtro e a linhagem', () => {
    expect(preservedFromPrevious({
      filterFields: DECLARATION,
      derivedFrom: 'covenants.emp_estoque',
    })).toEqual({ filterFields: DECLARATION, derivedFrom: 'covenants.emp_estoque' });
  });

  /*
   * A lista é curta de propósito: preservar o que o escritor EXPRESSA
   * transformaria "apaguei a unidade" em "a unidade voltou". Se algum dia esta
   * asserção quebrar, é porque alguém alargou a lista — e isso precisa de
   * argumento, não de conveniência.
   */
  it('não carrega nada que o escritor saiba expressar', () => {
    expect(preservedFromPrevious({
      filterFields: DECLARATION,
      label: 'Rótulo antigo',
      unit: 'BRL',
      description: 'antiga',
      recipe: { kind: 'sql', template: 'SELECT 0' },
      shape: 'series',
      outputColumns: ['bucket', 'value'],
      status: 'deprecated',
      origin: 'admin',
      ownerClientId: 'vila-rosa',
      version: '9.9.9',
    })).toEqual({ filterFields: DECLARATION });
  });

  it('sem documento anterior (criação), não devolve nada', () => {
    expect(preservedFromPrevious(undefined)).toEqual({});
    expect(preservedFromPrevious(null)).toEqual({});
  });

  /*
   * `null` é declaração INEXISTENTE, não quebrada: o schema recusa `null` num
   * campo `.optional()`, então repassá-lo travaria toda edição de um documento
   * que nunca teve declaração nenhuma.
   */
  it('ignora filterFields nulo ou que não é objeto', () => {
    expect(preservedFromPrevious({ filterFields: null })).toEqual({});
    expect(preservedFromPrevious({ filterFields: 'banco' })).toEqual({});
  });

  /*
   * Declaração MALFORMADA (objeto com `expr` inválida) passa daqui de
   * propósito: quem valida é o `MetricDoc` do chamador, e a escrita inteira
   * falha com o motivo. Descartar aqui seria perder o campo em silêncio — o
   * defeito que este módulo existe para impedir.
   */
  it('repassa declaração malformada para o chamador validar', () => {
    const bad = { banco: { expr: 'b.nome_reduzido --' } };
    expect(preservedFromPrevious({ filterFields: bad })).toEqual({ filterFields: bad });
  });

  it('ignora derivedFrom que não é string', () => {
    expect(preservedFromPrevious({ derivedFrom: 42 })).toEqual({});
  });
});
