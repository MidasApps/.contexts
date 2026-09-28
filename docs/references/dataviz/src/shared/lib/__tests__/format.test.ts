import { describe, it, expect } from 'vitest';
import { formatIsoDate, formatMonthLabel } from '../format';

describe('formatMonthLabel (Fase R/B3 — aceita bucket DATE_TRUNC)', () => {
  it('YYYY-MM → label curto pt-BR', () => {
    expect(formatMonthLabel('2026-01')).toBe('jan/26');
  });
  it('YYYY-MM-DD (bucket do resolver) → label curto', () => {
    expect(formatMonthLabel('2026-03-01')).toBe('mar/26');
    expect(formatMonthLabel('2025-12-01')).toBe('dez/25');
  });
  it('vazio → string vazia', () => {
    expect(formatMonthLabel('')).toBe('');
  });
  it('rótulo não-data com hífen passa cru (não mangla)', () => {
    expect(formatMonthLabel('01. 1 - 5 dias')).toBe('01. 1 - 5 dias');
  });
});

describe('formatIsoDate', () => {
  it('a data ISO do BigQuery vira data pt-BR', () => {
    expect(formatIsoDate('2026-09-15')).toBe('15/09/2026');
  });

  /*
   * Recorte por STRING, nunca `new Date(iso)`: essa construção lê o ISO como
   * meia-noite UTC, e no fuso do Brasil (UTC-3) o `toLocaleDateString`
   * devolveria o DIA ANTERIOR. Um indicador chamado "Data da Medição" errando
   * em um dia é pior que um que não formata.
   */
  it('não anda um dia para trás no fuso do Brasil', () => {
    expect(formatIsoDate('2026-01-01')).toBe('01/01/2026');
    expect(formatIsoDate('2025-03-01')).toBe('01/03/2025');
  });

  it('timestamp mostra o dia — o cartão tem uma linha só', () => {
    expect(formatIsoDate('2026-09-15T18:16:24.649875000Z')).toBe('15/09/2026');
    expect(formatIsoDate('2026-09-15 18:16:24')).toBe('15/09/2026');
  });

  it('o que não é data ISO passa cru', () => {
    expect(formatIsoDate('')).toBe('');
    expect(formatIsoDate('Vila Rosa')).toBe('Vila Rosa');
    expect(formatIsoDate('2026-09')).toBe('2026-09');
  });
});
