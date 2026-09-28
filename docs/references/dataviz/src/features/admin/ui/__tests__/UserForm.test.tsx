import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserForm } from '../UserForm';

const isAdminMock = vi.fn(() => true);
vi.mock('@/features/admin/model/useAdminGroups', () => ({ useAdminGroups: () => ({ groups: [] }) }));
vi.mock('@/features/admin/model/useAdminClients', () => ({
  useAdminClients: () => ({ clients: [{ id: 'vila-rosa', name: 'Vila Rosa', initial: 'VR', color: '#123456' }] }),
}));
vi.mock('@/shared/hooks/useUserPermissions', () => ({ useUserPermissions: () => ({ isAdmin: isAdminMock() }) }));

beforeEach(() => { isAdminMock.mockReturnValue(true); });

describe('UserForm — provisionamento', () => {
  it('exibe o checkbox "Criar credencial de acesso" (default marcado)', () => {
    render(<UserForm open onClose={() => {}} onSave={vi.fn(async () => ({ ok: true }))} />);
    const cb = screen.getByRole('checkbox', { name: /criar credencial/i }) as HTMLInputElement;
    expect(cb).toBeTruthy();
    expect(cb.checked).toBe(true);
  });

  it('após salvar novo usuário com resetLink, exibe o link one-shot', async () => {
    const onSave = vi.fn(async () => ({ ok: true, uid: 'u1', credentialCreated: true, resetLink: 'https://reset.example/xyz' }));
    render(<UserForm open onClose={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByPlaceholderText(/usuario@empresa/i), { target: { value: 'novo@empresa.com' } });
    fireEvent.change(screen.getByPlaceholderText(/nome do usuário/i), { target: { value: 'Novo' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(screen.getByText(/https:\/\/reset\.example\/xyz/)).toBeTruthy());
  });

  it('campo adminClientIds visível para admin global', () => {
    render(<UserForm open onClose={() => {}} onSave={vi.fn(async () => ({ ok: true }))} />);
    expect(screen.getByText(/administra os clientes/i)).toBeTruthy();
  });

  it('campo adminClientIds OCULTO para não-admin', () => {
    isAdminMock.mockReturnValue(false);
    render(<UserForm open onClose={() => {}} onSave={vi.fn(async () => ({ ok: true }))} />);
    expect(screen.queryByText(/administra os clientes/i)).toBeNull();
  });
});
