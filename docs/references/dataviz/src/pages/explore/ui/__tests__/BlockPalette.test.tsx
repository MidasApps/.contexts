/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BlockPalette } from '../BlockPalette';

describe('<BlockPalette>', () => {
  it('dispara onAdd com o tipo clicado', () => {
    const onAdd = vi.fn();
    render(<BlockPalette onAdd={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: /kpi/i }));
    expect(onAdd).toHaveBeenCalledWith('kpi');
    fireEvent.click(screen.getByRole('button', { name: /tabela/i }));
    expect(onAdd).toHaveBeenCalledWith('table');
  });
});
