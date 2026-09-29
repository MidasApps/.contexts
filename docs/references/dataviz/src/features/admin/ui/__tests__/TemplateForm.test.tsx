/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TemplateForm } from '../TemplateForm';

const products = [
  { id: 'credit', name: 'Credit' },
  { id: 'covenants', name: 'Covenants' },
];

describe('<TemplateForm>', () => {
  it('cria template novo com id derivado do nome', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<TemplateForm open onClose={() => {}} onSave={onSave} existingIds={[]} products={products} />);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Minha Análise' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'desc' } });
    fireEvent.click(screen.getByLabelText('Credit'));
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'minha-analise', name: 'Minha Análise', productRefs: ['credit'] }),
    );
  });

  it('pré-popula campos ao editar e mantém o id', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <TemplateForm
        open
        onClose={() => {}}
        onSave={onSave}
        existingIds={['pdd']}
        products={products}
        template={{ id: 'pdd', name: 'PDD', description: 'd', category: 'Risco', productRefs: ['credit'], status: 'active' }}
      />,
    );
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('PDD');
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'pdd' }));
  });

  it('rejeita nome muito curto', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<TemplateForm open onClose={() => {}} onSave={onSave} existingIds={[]} products={products} />);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejeita id duplicado em modo criação', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<TemplateForm open onClose={() => {}} onSave={onSave} existingIds={['minha-analise']} products={products} />);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Minha Análise' } });
    fireEvent.click(screen.getByLabelText('Credit'));
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejeita salvar sem nenhum produto', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<TemplateForm open onClose={() => {}} onSave={onSave} existingIds={[]} products={products} />);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Sem Produto' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    expect(onSave).not.toHaveBeenCalled();
  });
});
