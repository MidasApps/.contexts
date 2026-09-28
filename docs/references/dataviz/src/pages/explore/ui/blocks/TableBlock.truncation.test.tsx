/* @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TableBlock } from './TableBlock';
import type { TableBlock as TableBlockType } from '@/shared/config/agents/types';

/**
 * O defeito que estes testes trancam: a nota de rodapé era
 * `Exibindo 100 de {totalRows} linhas` com o **100 cravado no JSX**. Ela
 * afirmava cem linhas independentemente de quantas o pipeline devolveu — e
 * aparecia até quando nada tinha sido cortado.
 */
function table(rows: Record<string, unknown>[], totalRows?: number): TableBlockType {
  return {
    id: 't1',
    type: 'table',
    title: 'Contratos',
    columns: [{ header: 'nome', accessorKey: 'nome' }],
    rows,
    ...(totalRows !== undefined ? { totalRows } : {}),
  };
}

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ nome: `contrato ${i}` }));

describe('<TableBlock> nota de truncamento', () => {
  it('conta as linhas que realmente chegaram, não 100', () => {
    const { container } = render(<TableBlock block={table(rows(7), 3421)} />);
    expect(container.textContent).toContain('Exibindo 7 de 3.421 linhas');
    expect(container.textContent).not.toContain('Exibindo 100');
  });

  it('cala quando totalRows não indica corte nenhum', () => {
    const { container } = render(<TableBlock block={table(rows(12), 12)} />);
    expect(container.textContent).not.toContain('Exibindo');
  });

  it('cala quando o bloco não declara totalRows', () => {
    const { container } = render(<TableBlock block={table(rows(4))} />);
    expect(container.textContent).not.toContain('Exibindo');
  });
});
