import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { resolveStatusVariant } from './status-badge';
import { TableBlock } from './TableBlock';
import type { TableBlock as TableBlockType } from '@/shared/config/agents/types';

describe('resolveStatusVariant', () => {
  it('usa statusMap quando fornecido', () => {
    expect(resolveStatusVariant('H', { H: 'danger' })).toBe('danger');
  });
  it('defaults PT-BR', () => {
    expect(resolveStatusVariant('Válida')).toBe('success');
    expect(resolveStatusVariant('Inválida')).toBe('danger');
    expect(resolveStatusVariant('qualquer')).toBe('neutral');
  });
});

describe('TableBlock coluna status-badge', () => {
  it('renderiza badge com a variante correta para Válida e Inválida', () => {
    const block: TableBlockType = {
      id: 't1',
      type: 'table',
      title: 'Certidões',
      columns: [
        { header: 'nome', accessorKey: 'nome' },
        { header: 'status', accessorKey: 'status', format: 'status-badge' },
      ],
      rows: [
        { nome: 'CND Federal', status: 'Válida' },
        { nome: 'CND Estadual', status: 'Inválida' },
      ],
    };

    const { container } = render(<TableBlock block={block} />);
    const badges = container.querySelectorAll('[data-slot="badge"]');
    expect(badges.length).toBe(2);
    expect(badges[0].textContent).toBe('Válida');
    expect(badges[0].getAttribute('data-status-variant')).toBe('success');
    expect(badges[1].textContent).toBe('Inválida');
    expect(badges[1].getAttribute('data-status-variant')).toBe('danger');
  });
});
