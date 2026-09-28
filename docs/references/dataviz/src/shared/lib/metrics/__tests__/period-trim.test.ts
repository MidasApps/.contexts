import { describe, it, expect } from 'vitest';
import { isPeriodTrimmed, positionMonth } from '../period-trim';

/**
 * A nota "não acompanha o período" só é honesta quando há período recortado.
 * Sem recorte, as métricas fixadas e as que acompanham descrevem o mesmo
 * intervalo — e a nota em 52 dos 64 blocos seria ruído que ninguém lê,
 * inclusive nas vezes em que ela importa.
 */

const OPTIONS = [
  { value: '2026-07-01' }, // a mais recente vem primeiro
  { value: '2026-06-01' },
  { value: '2026-05-01' },
];

describe('isPeriodTrimmed', () => {
  it('faixa inteira não é recorte', () => {
    expect(isPeriodTrimmed({ start: '2026-05-01', end: '2026-07-01' }, OPTIONS)).toBe(false);
  });

  it('início mais recente que o disponível é recorte', () => {
    expect(isPeriodTrimmed({ start: '2026-06-01', end: '2026-07-01' }, OPTIONS)).toBe(true);
  });

  it('fim anterior ao disponível é recorte', () => {
    expect(isPeriodTrimmed({ start: '2026-05-01', end: '2026-06-01' }, OPTIONS)).toBe(true);
  });

  it('um mês só é recorte', () => {
    expect(isPeriodTrimmed({ start: '2026-06-01', end: '2026-06-01' }, OPTIONS)).toBe(true);
  });

  /*
   * Antes das datas chegarem não há como saber o que é a faixa inteira —
   * afirmar recorte aí acenderia a nota em toda a página no primeiro paint.
   */
  it('sem as opções carregadas, não afirma recorte', () => {
    expect(isPeriodTrimmed({ start: '2026-06-01', end: '2026-06-01' }, [])).toBe(false);
  });

  it('período em branco não é recorte', () => {
    expect(isPeriodTrimmed({ start: '', end: '' }, OPTIONS)).toBe(false);
  });

  /*
   * Ausente é a mesma situação de vazio. Não é preciosismo: o contexto de
   * filtros chega depois do primeiro render, e explodir aqui derrubava a
   * página inteira de relatório.
   */
  it('contexto ainda não disponível não explode nem afirma recorte', () => {
    expect(isPeriodTrimmed(undefined, OPTIONS)).toBe(false);
    expect(isPeriodTrimmed({ start: '2026-06-01', end: '2026-06-01' }, undefined)).toBe(false);
    expect(positionMonth(undefined)).toBeNull();
  });
});

describe('positionMonth', () => {
  /**
   * O mês que o bloco fixado REALMENTE descreve — e ele depende do período.
   *
   * O contrato anterior devolvia sempre a data mais recente do dataset, sob a
   * crença de que o pin era `MAX(data_base_report)` sobre a tabela inteira. Não
   * é: desde `patch-covenants-snapshot-pin.mjs` o `MAX` é calculado dentro da
   * faixa (`{filter.ate}` = o fim do período). Com jul/26 no dataset e o período
   * terminando em jun/26, o número na tela é o de JUNHO — e a nota anunciava
   * julho, que é exatamente a afirmação falsa que ela existe para evitar.
   */
  it('é a última medição disponível DENTRO do período', () => {
    expect(positionMonth(OPTIONS, '2026-06-01')).toBe('2026-06-01');
  });

  /*
   * O fim escolhido não precisa coincidir com uma medição: entidades têm
   * cadências diferentes. Vale a última que existe em ou antes dele — a mesma
   * regra do `WHERE data_base_report <= @ate` no SQL.
   */
  it('cai na medição anterior quando o fim do período não tem medição', () => {
    expect(positionMonth(OPTIONS, '2026-06-20')).toBe('2026-06-01');
  });

  it('sem fim de período, é a mais recente do dataset', () => {
    expect(positionMonth(OPTIONS)).toBe('2026-07-01');
  });

  /* Período inteiro antes da primeira medição: não há posição a anunciar. */
  it('não inventa data quando nada existe dentro do período', () => {
    expect(positionMonth(OPTIONS, '2026-01-01')).toBeNull();
  });

  it('sem opções não inventa uma data', () => {
    expect(positionMonth([])).toBeNull();
  });
});
