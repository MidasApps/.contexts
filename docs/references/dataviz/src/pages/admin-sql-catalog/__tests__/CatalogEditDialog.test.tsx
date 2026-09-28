/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { SqlCatalogRow } from '@/features/sql-catalog/repository';

const { dryRunMock, updateMock } = vi.hoisted(() => ({
  dryRunMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('@/shared/hooks/useSqlCatalog', () => ({
  sqlCatalogApi: {
    dryRun: dryRunMock,
    update: updateMock,
    approve: vi.fn(),
    reject: vi.fn(),
    revalidate: vi.fn(),
  },
}));

import { CatalogEditDialog } from '../ui/CatalogEditDialog';

function row(): SqlCatalogRow {
  return {
    id: 'r1',
    intent: 'safra',
    sql: 'SELECT 1',
    sql_hash: 'h',
    schema_snapshot: null,
    client_id: 'OM',
    persona_id: null,
    tags: null,
    quality_score: 0.85,
    curated_by: null,
    curated_at: null,
    glossary_version: null,
    regulatory_pack_version: null,
    status: 'draft',
    use_count: 0,
    last_used_at: null,
    created_at: '2026-05-01',
    updated_at: '2026-05-01',
  };
}

describe('<CatalogEditDialog>', () => {
  beforeEach(() => {
    dryRunMock.mockReset();
    updateMock.mockReset();
  });

  it('Save is enabled when SQL is unchanged (no dry-run needed)', () => {
    render(<CatalogEditDialog row={row()} open onClose={vi.fn()} onSaved={vi.fn()} />);
    const save = screen.getByLabelText('save-edit') as HTMLButtonElement;
    expect(save.disabled).toBe(false);
  });

  it('changing SQL disables Save until successful dry-run', async () => {
    dryRunMock.mockResolvedValueOnce({ ok: true, json: async () => ({ valid: true }) } as Response);
    render(<CatalogEditDialog row={row()} open onClose={vi.fn()} onSaved={vi.fn()} />);
    const sqlField = screen.getByLabelText('edit-sql');
    fireEvent.change(sqlField, { target: { value: 'SELECT 2' } });
    const save = screen.getByLabelText('save-edit') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByText('Run dry-run'));
    await waitFor(() => expect(screen.getByText('dry-run ok')).toBeInTheDocument());
    expect(save.disabled).toBe(false);
  });

  it('failed dry-run keeps Save disabled and shows error', async () => {
    dryRunMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'syntax err' }),
    } as Response);
    render(<CatalogEditDialog row={row()} open onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('edit-sql'), { target: { value: 'BAD' } });
    fireEvent.click(screen.getByText('Run dry-run'));
    await waitFor(() => expect(screen.getByText(/dry-run falhou/i)).toBeInTheDocument());
    const save = screen.getByLabelText('save-edit') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });
});
