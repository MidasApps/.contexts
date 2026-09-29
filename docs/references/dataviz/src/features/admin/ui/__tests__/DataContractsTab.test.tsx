/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { DataContract } from '@/shared/schemas';

// Mock do hook de dados — DataContractsTab consome useAdminContracts direto
// (faz fetch on mount). Mockamos para controlar os contratos e espionar deprecate.
const deprecate = vi.fn().mockResolvedValue(undefined);
const remove = vi.fn().mockResolvedValue(undefined);
const save = vi.fn().mockResolvedValue(undefined);
const refetch = vi.fn().mockResolvedValue(undefined);
let mockContracts: DataContract[] = [];

vi.mock('@/features/admin/model/useAdminContracts', () => ({
  useAdminContracts: () => ({
    contracts: mockContracts,
    loading: false,
    error: null,
    save,
    deprecate,
    remove,
    refetch,
  }),
}));

import { DataContractsTab } from '../DataContractsTab';

function contract(o: Partial<DataContract>): DataContract {
  return {
    id: 'canonical',
    name: 'Canonical',
    version: '1.0.0',
    status: 'active',
    description: 'desc',
    createdAt: null,
    updatedAt: null,
    ...o,
  } as DataContract;
}

describe('<DataContractsTab> soft-delete (deprecate)', () => {
  beforeEach(() => {
    mockContracts = [];
  });

  it('mostra botão de deprecate para contratos ativos', () => {
    mockContracts = [contract({ id: 'ativo', status: 'active' })];
    render(<DataContractsTab />);
    expect(screen.getByTitle('Deprecate (soft)')).toBeInTheDocument();
  });

  it('não mostra botão de deprecate para contratos já deprecated', () => {
    mockContracts = [contract({ id: 'velho', status: 'deprecated' })];
    render(<DataContractsTab />);
    expect(screen.queryByTitle('Deprecate (soft)')).not.toBeInTheDocument();
  });

  it('chama deprecate(id) ao confirmar o diálogo', async () => {
    mockContracts = [contract({ id: 'ativo', status: 'active' })];
    render(<DataContractsTab />);

    fireEvent.click(screen.getByTitle('Deprecate (soft)'));
    fireEvent.click(screen.getByRole('button', { name: /marcar deprecated/i }));

    await waitFor(() => expect(deprecate).toHaveBeenCalledWith('ativo'));
  });
});
