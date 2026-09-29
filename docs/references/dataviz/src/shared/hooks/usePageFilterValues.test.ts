import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePageFilterValues } from './usePageFilterValues';

interface Props {
  key: string;
  initial?: Record<string, string[]>;
}

describe('usePageFilterValues', () => {
  describe('G3 — reset automático na troca de report/template/cliente', () => {
    it('começa vazio e acumula seleção via handlePageFilterChange', () => {
      const { result } = renderHook(() => usePageFilterValues('client-a|group-1|report-1'));
      expect(result.current.pageFilterValues).toEqual({});

      act(() => result.current.handlePageFilterChange('banco', ['001', '341']));
      expect(result.current.pageFilterValues).toEqual({ banco: ['001', '341'] });

      act(() => result.current.handlePageFilterChange('categoria', ['aluguel']));
      expect(result.current.pageFilterValues).toEqual({
        banco: ['001', '341'],
        categoria: ['aluguel'],
      });
    });

    it('reseta quando resetKey muda por troca de CLIENTE (mesmo groupId/reportId)', () => {
      const { result, rerender } = renderHook(
        ({ key }: { key: string }) => usePageFilterValues(key),
        { initialProps: { key: 'client-a|group-1|report-1' } },
      );

      act(() => result.current.handlePageFilterChange('categoria', ['aluguel']));
      expect(result.current.pageFilterValues).toEqual({ categoria: ['aluguel'] });

      // resetKey é uma string opaca (`${clientId}|${groupId}|${reportId}`) —
      // qualquer segmento que mude, incluindo o cliente, já deve disparar o
      // reset, não só a troca de report/template.
      rerender({ key: 'client-b|group-1|report-1' });
      expect(result.current.pageFilterValues).toEqual({});
    });

    it('NÃO reseta em re-render sem mudança de resetKey (chamado sem initialValues — compat com RouteTemplatePage)', () => {
      const { result, rerender } = renderHook(
        ({ key }: { key: string }) => usePageFilterValues(key),
        { initialProps: { key: 'client-a|template-1' } },
      );

      act(() => result.current.handlePageFilterChange('tipo', ['pix']));
      rerender({ key: 'client-a|template-1' });
      expect(result.current.pageFilterValues).toEqual({ tipo: ['pix'] });
    });
  });

  describe('G5 — initialValues (drill-through via querystring)', () => {
    it('inicia com initialValues quando fornecido (drill-through via querystring)', () => {
      const { result } = renderHook(() => usePageFilterValues('key-1', { banco: ['001'] }));
      expect(result.current.pageFilterValues).toEqual({ banco: ['001'] });
    });

    it('reseta para {} quando resetKey muda sem novo initialValues', () => {
      const { result, rerender } = renderHook<ReturnType<typeof usePageFilterValues>, Props>(
        ({ key, initial }) => usePageFilterValues(key, initial),
        { initialProps: { key: 'key-1', initial: { banco: ['001'] } } },
      );
      expect(result.current.pageFilterValues).toEqual({ banco: ['001'] });

      act(() => {
        result.current.handlePageFilterChange('categoria', ['Taxas']);
      });
      expect(result.current.pageFilterValues).toEqual({ banco: ['001'], categoria: ['Taxas'] });

      rerender({ key: 'key-2', initial: undefined });
      expect(result.current.pageFilterValues).toEqual({});
    });

    it('aplica initialValues da nova navegação ao trocar resetKey (drill-through)', () => {
      const { result, rerender } = renderHook<ReturnType<typeof usePageFilterValues>, Props>(
        ({ key, initial }) => usePageFilterValues(key, initial),
        { initialProps: { key: 'key-1', initial: undefined } },
      );
      expect(result.current.pageFilterValues).toEqual({});

      rerender({ key: 'key-2', initial: { banco: ['237'] } });
      expect(result.current.pageFilterValues).toEqual({ banco: ['237'] });
    });

    it('não reseta ao re-renderizar com o mesmo resetKey mesmo que initialValues mude de referência', () => {
      const { result, rerender } = renderHook<ReturnType<typeof usePageFilterValues>, Props>(
        ({ key, initial }) => usePageFilterValues(key, initial),
        { initialProps: { key: 'key-1', initial: { banco: ['001'] } } },
      );
      act(() => {
        result.current.handlePageFilterChange('categoria', ['Taxas']);
      });
      expect(result.current.pageFilterValues).toEqual({ banco: ['001'], categoria: ['Taxas'] });

      // mesmo resetKey, nova referência de `initial` (simulando re-parse da
      // querystring a cada render) — não deve apagar a seleção do usuário.
      rerender({ key: 'key-1', initial: { banco: ['001'] } });
      expect(result.current.pageFilterValues).toEqual({ banco: ['001'], categoria: ['Taxas'] });
    });
  });
});
