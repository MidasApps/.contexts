/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { SqlCatalogRow } from '@/features/sql-catalog/repository';
import { CatalogTable } from '../ui/CatalogTable';

function row(overrides: Partial<SqlCatalogRow>): SqlCatalogRow {
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
    curated_by: 'admin',
    curated_at: null,
    glossary_version: null,
    regulatory_pack_version: null,
    status: 'approved',
    use_count: 3,
    last_used_at: null,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-04T00:00:00Z',
    ...overrides,
  };
}

describe('<CatalogTable>', () => {
  it('renders N rows with status badges', () => {
    render(
      <CatalogTable
        rows={[row({ id: 'a', status: 'approved' }), row({ id: 'b', status: 'draft' })]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
        onRevalidate={vi.fn()}
      />,
    );
    expect(screen.getByText('approved')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
  });

  it('hides Approve button on already-approved rows', () => {
    render(
      <CatalogTable
        rows={[row({ id: 'a', status: 'approved' })]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
        onRevalidate={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('approve-a')).not.toBeInTheDocument();
    expect(screen.getByLabelText('edit-a')).toBeInTheDocument();
  });

  it('shows Approve + Revalidate on needs_revalidation', () => {
    render(
      <CatalogTable
        rows={[row({ id: 'a', status: 'needs_revalidation' })]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
        onRevalidate={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('approve-a')).toBeInTheDocument();
    expect(screen.getByLabelText('revalidate-a')).toBeInTheDocument();
  });

  it('shows Revalidate on approved rows too, to re-check old approvals', () => {
    render(
      <CatalogTable
        rows={[row({ id: 'a', status: 'approved' })]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
        onRevalidate={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('revalidate-a')).toBeInTheDocument();
  });

  it('hides all destructive actions on deprecated rows', () => {
    render(
      <CatalogTable
        rows={[row({ id: 'a', status: 'deprecated' })]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
        onRevalidate={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('approve-a')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('reject-a')).not.toBeInTheDocument();
  });

  it('shows empty state when rows is empty', () => {
    render(
      <CatalogTable
        rows={[]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
        onRevalidate={vi.fn()}
      />,
    );
    expect(screen.getByText(/Nenhuma entrada/i)).toBeInTheDocument();
  });
});
