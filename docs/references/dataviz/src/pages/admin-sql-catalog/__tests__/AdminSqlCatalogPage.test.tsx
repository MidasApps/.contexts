/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { useSqlCatalogMock, approveMock, rejectMock, revalidateMock, toastErrorMock, toastSuccessMock } =
  vi.hoisted(() => ({
    useSqlCatalogMock: vi.fn(),
    approveMock: vi.fn(),
    rejectMock: vi.fn(),
    revalidateMock: vi.fn(),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
  }));

vi.mock('@/widgets/app-bar', () => ({
  AppBar: ({ pageTitle }: { pageTitle: string }) => <div>{pageTitle}</div>,
}));

vi.mock('@/shared/hooks/useSqlCatalog', () => ({
  useSqlCatalog: useSqlCatalogMock,
  sqlCatalogApi: {
    approve: approveMock,
    reject: rejectMock,
    revalidate: revalidateMock,
    dryRun: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock },
  Toaster: () => null,
}));

// O filtro de cliente passou a vir do cadastro. Sem este mock o hook real
// inicializa o Firebase para pegar o token, e o teste deixa de ser hermético —
// mesma falha que os testes que acessavam rede tinham (achado R15).
vi.mock('@/features/admin/model/useAdminClients', () => ({
  useAdminClients: () => ({
    clients: [{ id: 'vila-rosa', name: 'Vila Rosa' }],
    loading: false,
  }),
}));

import { AdminSqlCatalogPage } from '../ui/AdminSqlCatalogPage';

const baseRow = {
  id: 'r1',
  intent: 'safra OM',
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
  status: 'draft' as const,
  use_count: 0,
  last_used_at: null,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
};

describe('<AdminSqlCatalogPage>', () => {
  beforeEach(() => {
    useSqlCatalogMock.mockReset();
    approveMock.mockReset();
    rejectMock.mockReset();
    revalidateMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    useSqlCatalogMock.mockReturnValue({
      data: { items: [baseRow], total: 1, page: 1, pageSize: 50 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    // happy-dom may not implement window.prompt — assign a stub.
    (window as unknown as { prompt: (msg?: string) => string | null }).prompt = () => '0.85';
  });

  it('renders header + table', () => {
    render(<AdminSqlCatalogPage />);
    expect(screen.getAllByText('Catálogo de SQL Validado').length).toBeGreaterThan(0);
    expect(screen.getByText('safra OM')).toBeInTheDocument();
  });

  it('approve mutation 422 shows "dry_run falhou" toast', async () => {
    approveMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: 'dry_run failed' }),
    } as Response);
    render(<AdminSqlCatalogPage />);
    fireEvent.click(screen.getByLabelText('approve-r1'));
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/dry_run falhou/i)),
    );
  });

  // `mockReturnValue`, não `...Once`: a página pode renderizar mais de uma vez
  // (o cadastro de clientes chega depois). Com `Once`, a renderização seguinte
  // via o mock vazio e o painel de erro sumia — o teste falharia por um motivo
  // que não é o que ele mede. `beforeEach` reseta o mock, então não vaza.
  it('shows "Acesso negado" panel when hook reports 403', () => {
    useSqlCatalogMock.mockReturnValue({
      data: null,
      loading: false,
      error: 'Acesso negado',
      refetch: vi.fn(),
    });
    render(<AdminSqlCatalogPage />);
    expect(screen.getByText(/Acesso negado/i)).toBeInTheDocument();
  });
});
