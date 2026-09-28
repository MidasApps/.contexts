import { describe, it, expect } from 'vitest';
import { formatValue } from './useReportData';

describe('formatValue', () => {
  describe('format: number', () => {
    it('sem decimals/suffix mantém comportamento antigo (0 casas, sem sufixo)', () => {
      expect(formatValue(24.82, 'number')).toBe('25');
    });

    it('com decimals honra as casas decimais', () => {
      expect(formatValue(24.82, 'number', 2)).toBe('24,82');
    });

    it('com decimals+suffix anexa o sufixo ao final', () => {
      expect(formatValue(24.82, 'number', 2, '%')).toBe('24,82%');
    });

    it('com decimals+suffix em valor negativo (desvio)', () => {
      expect(formatValue(-1.98, 'number', 2, '%')).toBe('-1,98%');
    });

    it('com decimals sem suffix (índice, sem símbolo)', () => {
      expect(formatValue(14.64, 'number', 2)).toBe('14,64');
    });
  });

  describe('format: currency / percent / default — retrocompat sem os campos novos', () => {
    it('currency ignora decimals (formatCurrency já tem regra própria de casas)', () => {
      expect(formatValue(1500, 'currency')).toBe('R$ 1,5 mil');
    });

    it('percent sem decimals mantém default de formatPercent (2 casas)', () => {
      expect(formatValue(0.2482, 'percent')).toBe('24,82%');
    });

    it('default (sem format) retorna String(value), ignorando decimals/suffix', () => {
      expect(formatValue(42, undefined)).toBe('42');
    });
  });
});
