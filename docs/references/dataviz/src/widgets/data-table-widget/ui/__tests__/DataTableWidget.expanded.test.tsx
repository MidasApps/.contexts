/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTableWidget } from '../DataTableWidget';

/**
 * Expandir a tabela abria uma SEGUNDA tabela, montada à mão dentro do diálogo:
 * as mesmas linhas, sem nada em volta. Sumiam a ordenação por coluna, o CSV,
 * a escolha de colunas e a linha de "Total geral" — justamente na tela que
 * existe para examinar o dado com calma.
 *
 * O diálogo passa a mostrar a MESMA tabela do card. A única diferença que ele
 * mantém é não paginar: ali o espaço é a tela inteira, e rolar é melhor do que
 * trocar de página.
 */

vi.mock('@/widgets/ai-sidebar', () => ({
  AISidebar: () => <div data-testid="ai-sidebar" />,
}));

interface Row {
  faixa: string;
  contratos: number;
}

const COLUMNS: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'faixa', header: 'Faixa Atraso' },
  { accessorKey: 'contratos', header: 'Contratos' },
];

/*
 * Fora de ordem por `contratos` DE PROPÓSITO. O TanStack ordena coluna
 * numérica em ordem decrescente no primeiro clique, e a carteira real já chega
 * decrescente — com ela, ordenar não mexeria em nada e o teste passaria verde
 * sobre um botão morto.
 */
const DATA: Row[] = [
  { faixa: '02. 6 - 30 dias', contratos: 15 },
  { faixa: '00. Sem atraso', contratos: 77 },
  { faixa: '05. Acima de 90 dias', contratos: 2 },
];

const TOTAL = { faixa: 'Total geral', contratos: 94 };

function openDialog() {
  render(
    <DataTableWidget
      title="Faixa de Atraso"
      columns={COLUMNS}
      data={DATA}
      footerRow={TOTAL}
      pageSize={2}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /ver detalhes/i }));
  return screen.getByRole('dialog');
}

describe('<DataTableWidget> expandido', () => {
  it('mantém a ordenação por coluna', () => {
    const dialog = openDialog();
    const header = within(dialog).getByRole('button', { name: /faixa atraso/i });
    expect(header).toBeInTheDocument();
  });

  it('mantém a linha de total', () => {
    const dialog = openDialog();
    expect(within(dialog).getByText('Total geral')).toBeInTheDocument();
  });

  it('mantém a exportação em CSV', () => {
    const dialog = openDialog();
    expect(within(dialog).getByTitle('Exportar CSV')).toBeInTheDocument();
  });

  /* O card pagina em 2; o diálogo mostra as 3 — ali o espaço é a tela toda, e
     rolar é melhor que trocar de página para comparar faixas. */
  it('mostra todas as linhas, sem paginar', () => {
    const dialog = openDialog();
    expect(within(dialog).getByText('05. Acima de 90 dias')).toBeInTheDocument();
    expect(within(dialog).queryByText(/\/ página/)).not.toBeInTheDocument();
  });

  it('ordenar no diálogo reordena o que está na tela', () => {
    const dialog = openDialog();
    const dataOnly = () => within(dialog).getAllByRole('row')
      .map((l) => l.textContent ?? '')
      .filter((t) => t.startsWith('0'));

    expect(dataOnly()[0]).toContain('02. 6 - 30 dias');
    fireEvent.click(within(dialog).getByRole('button', { name: /contratos/i }));
    // Primeiro clique em coluna numérica ordena do maior para o menor.
    expect(dataOnly()[0]).toContain('00. Sem atraso');
  });

  it('o card continua paginando', () => {
    render(
      <DataTableWidget title="Faixa de Atraso" columns={COLUMNS} data={DATA} pageSize={2} />,
    );
    expect(screen.getByText('00. Sem atraso')).toBeInTheDocument();
    expect(screen.queryByText('05. Acima de 90 dias')).not.toBeInTheDocument();
  });
});
