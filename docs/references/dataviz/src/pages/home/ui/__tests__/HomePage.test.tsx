/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const replaceMock = vi.fn();
const useGroupsMock = vi.fn();
const useReportsMock = vi.fn();
const setActiveReportMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('@/shared/hooks/useGroups', () => ({
  useGroups: () => useGroupsMock(),
}));

vi.mock('@/shared/hooks/useReports', () => ({
  useReports: () => useReportsMock(),
}));

vi.mock('@/shared/stores/app-store', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ setActiveReport: setActiveReportMock, activeClientId: 'vila-rosa' }),
}));

const canAccessRouteMock = vi.fn();
vi.mock('@/shared/hooks/useUserPermissions', () => ({
  useUserPermissions: () => ({ isAdmin: false, canAccessRoute: canAccessRouteMock }),
}));

import { HomePage } from '../HomePage';

const REPORTS = [
  { id: 'visao-executiva', name: 'Covenants', order: 1 },
  { id: 'empreendimento', name: 'Empreendimento', order: 2 },
];

beforeEach(() => {
  replaceMock.mockClear();
  setActiveReportMock.mockClear();
  canAccessRouteMock.mockReset().mockReturnValue(true);
  useGroupsMock.mockReturnValue({ groups: [{ id: 'covenants' }], loading: false });
  useReportsMock.mockReturnValue({ reports: REPORTS, loading: false });
});

describe('HomePage', () => {
  it('redireciona para a primeira página do cliente', () => {
    render(<HomePage />);
    expect(replaceMock).toHaveBeenCalledWith('/g/covenants/r/visao-executiva');
  });

  it('registra a página de destino como ativa antes de navegar', () => {
    render(<HomePage />);
    expect(setActiveReportMock).toHaveBeenCalledWith('covenants', 'visao-executiva');
  });

  it('não navega enquanto os grupos ainda estão carregando', () => {
    useGroupsMock.mockReturnValue({ groups: [], loading: true });
    useReportsMock.mockReturnValue({ reports: [], loading: true });
    render(<HomePage />);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('não navega enquanto as páginas ainda estão carregando', () => {
    useReportsMock.mockReturnValue({ reports: [], loading: true });
    render(<HomePage />);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('mostra estado vazio — e não navega — quando o cliente não tem páginas', () => {
    useReportsMock.mockReturnValue({ reports: [], loading: false });
    render(<HomePage />);
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByText(/nenhuma página ainda/i)).toBeTruthy();
  });

  // Regressão: sem permissão em `/g`, redirecionar criava ping-pong — o
  // ProtectedRoute barrava o destino e devolvia o usuário para `/dashboard`,
  // que redirecionava de novo. O gate tem de ser o MESMO token que o
  // ProtectedRoute checa depois de normalizeRoute.
  it('não redireciona quando o usuário não tem acesso a /g (evita loop com o ProtectedRoute)', () => {
    canAccessRouteMock.mockReturnValue(false);
    render(<HomePage />);
    expect(replaceMock).not.toHaveBeenCalled();
    expect(setActiveReportMock).not.toHaveBeenCalled();
    expect(screen.getByText(/sem acesso aos relatórios/i)).toBeTruthy();
  });

  it('checa a permissão pelo token /g, não pela URL completa do relatório', () => {
    render(<HomePage />);
    expect(canAccessRouteMock).toHaveBeenCalledWith('vila-rosa', '/g');
  });

  it('respeita a ordem: navega para a de menor `order`, não para a primeira do array', () => {
    useReportsMock.mockReturnValue({
      reports: [
        { id: 'segunda', name: 'Segunda', order: 2 },
        { id: 'primeira', name: 'Primeira', order: 1 },
      ],
      loading: false,
    });
    render(<HomePage />);
    expect(replaceMock).toHaveBeenCalledWith('/g/covenants/r/primeira');
  });
});
