import { describe, it, expect } from 'vitest';
import type { CanvasBlock } from '@/shared/config/agents/types';
import { createTurnLog } from './turn-log';

const kpi = (colSpan?: number) =>
  ({ id: crypto.randomUUID(), type: 'kpi', label: 'K', ...(colSpan ? { colSpan } : {}) }) as CanvasBlock;
const table = () =>
  ({ id: crypto.randomUUID(), type: 'table', columns: [{ header: 'h', accessorKey: 'k' }] }) as CanvasBlock;

/**
 * O modelo construía às cegas a partir do segundo bloco: o resultado da tool era
 * o eco do input e o inventário da página nunca era reemitido durante o turno.
 */
describe('registro do turno', () => {
  it('empacota como o canvas: três KPIs fecham a linha, o quarto abre a próxima', () => {
    const r = createTurnLog();
    expect(r.register(kpi()).linha).toBe(1);
    expect(r.register(kpi()).linha).toBe(1);

    const third = r.register(kpi());
    expect(third.linha).toBe(1);
    expect(third.livre).toBe(0);

    expect(r.register(kpi()).linha).toBe(2);
    expect(r.total()).toBe(4);
  });

  it('conta o espaço livre para o modelo escolher o próximo bloco', () => {
    const r = createTurnLog();
    const first = r.register(kpi());
    expect(first.ocupado).toBe(2);
    expect(first.livre).toBe(4);
    expect(first.resumo).toMatch(/sobram 4 colunas/);
  });

  it('bloco de linha inteira ocupa sozinho e avisa que a linha fechou', () => {
    const r = createTurnLog();
    const t = r.register(table());
    expect(t.ocupado).toBe(6);
    expect(t.livre).toBe(0);
    expect(t.resumo).toMatch(/fica completa/);
  });

  // Um bloco largo demais para o que sobrou não pode "caber" à força.
  it('bloco que não cabe no resto da linha abre a próxima', () => {
    const r = createTurnLog();
    r.register(kpi());            // ocupa 2, sobram 4
    const t = r.register(table()); // precisa de 6
    expect(t.linha).toBe(2);
    expect(t.ocupado).toBe(6);
  });
});
