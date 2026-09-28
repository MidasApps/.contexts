/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { SingleKpiBlock } from '../SingleKpiBlock';
import {
  KPI_ICON_NAMES,
  type SingleKpiBlock as SingleKpiBlockType,
} from '@/shared/config/agents/types';

vi.mock('@/shared/config/glossary', () => ({ GLOSSARY: {}, getGlossaryEntry: () => undefined }));

/**
 * `iconName` era `string`: um nome fora da lista (`'Wallet2'`, `'wallet'`) não
 * era erro em lugar nenhum — caía calado no `TrendingUp`, e o único jeito de
 * descobrir era olhar a tela. Agora a lista é fechada (`KpiIconName`), então o
 * template erra na compilação.
 *
 * O fallback continua existindo e é testado aqui porque o bloco vem do
 * Firestore: tipo não valida documento já gravado.
 */
function block(extra: Partial<SingleKpiBlockType> = {}): SingleKpiBlockType {
  return { id: 'k1', type: 'kpi', label: 'Dívida', value: 'R$ 1,00', ...extra } as SingleKpiBlockType;
}

function iconOf(container: HTMLElement): string | null {
  // lucide-react marca cada ícone com `lucide-<nome-kebab>`.
  const svg = container.querySelector('svg.lucide');
  return svg?.getAttribute('class')?.match(/lucide-[a-z0-9-]+/g)?.at(-1) ?? null;
}

describe('<SingleKpiBlock> ícone', () => {
  it('desenha o ícone pedido pelo bloco', () => {
    const { container } = render(<SingleKpiBlock block={block({ iconName: 'Wallet' })} />);
    expect(iconOf(container)).toBe('lucide-wallet');
  });

  it('todo nome da lista tem ícone registrado', () => {
    for (const name of KPI_ICON_NAMES) {
      const { container, unmount } = render(<SingleKpiBlock block={block({ iconName: name })} />);
      expect(iconOf(container), `${name} não desenhou ícone`).toBeTruthy();
      unmount();
    }
  });

  it('nome desconhecido vindo do Firestore cai no default sem quebrar', () => {
    // `as` de propósito: é o caso que o tipo agora impede em código, mas que um
    // documento antigo ainda pode conter.
    const legacy = block({ iconName: 'Wallet2' as never });
    const { container } = render(<SingleKpiBlock block={legacy} />);
    expect(iconOf(container)).toBe('lucide-trending-up');
  });
});
