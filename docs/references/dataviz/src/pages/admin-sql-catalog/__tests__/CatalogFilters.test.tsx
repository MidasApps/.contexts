/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CatalogFilters } from '../ui/CatalogFilters';

const CLIENTS = [
  { id: 'vila-rosa', name: 'Vila Rosa' },
  { id: 'cliente-novo', name: 'Cliente Novo' },
];

describe('<CatalogFilters>', () => {
  // O dropdown já foi uma lista literal no código e ficou fora de sincronia com
  // o cadastro: oferecia clientes que não existiam mais e escondia o único que
  // existia. Agora ele mostra o que veio do cadastro, e nada além disso.
  it('oferece exatamente os clientes recebidos', () => {
    render(<CatalogFilters value={{ clientId: 'vila-rosa' }} clients={CLIENTS} onChange={vi.fn()} />);
    const select = screen.getByLabelText('clientId') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['vila-rosa', 'cliente-novo']);
  });

  it('mostra o nome do cliente, não o id', () => {
    render(<CatalogFilters value={{ clientId: 'vila-rosa' }} clients={CLIENTS} onChange={vi.fn()} />);
    const select = screen.getByLabelText('clientId') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['Vila Rosa', 'Cliente Novo']);
  });

  // Enquanto o cadastro carrega a lista chega vazia. Sem esta opção o select
  // renderiza em branco e parece quebrado.
  it('avisa quando não há cliente cadastrado', () => {
    render(<CatalogFilters value={{ clientId: '' }} clients={[]} onChange={vi.fn()} />);
    const select = screen.getByLabelText('clientId') as HTMLSelectElement;
    expect(select.options).toHaveLength(1);
    expect(select.options[0].textContent).toMatch(/nenhum cliente/i);
  });

  it('calls onChange when client changes', () => {
    const onChange = vi.fn();
    render(<CatalogFilters value={{ clientId: 'vila-rosa' }} clients={CLIENTS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('clientId'), { target: { value: 'cliente-novo' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'cliente-novo' }));
  });

  it('calls onChange when status changes', () => {
    const onChange = vi.fn();
    render(<CatalogFilters value={{ clientId: 'vila-rosa' }} clients={CLIENTS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('status'), { target: { value: 'approved' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
  });

  it('calls onChange when search input changes', () => {
    const onChange = vi.fn();
    render(<CatalogFilters value={{ clientId: 'vila-rosa' }} clients={CLIENTS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('search'), { target: { value: 'safra' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ search: 'safra' }));
  });
});
