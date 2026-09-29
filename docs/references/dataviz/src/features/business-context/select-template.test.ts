import { describe, it, expect, vi } from 'vitest';
import { selectTemplate } from './select-template';

// O catálogo shipado ficou vazio com a purga de clientes. Mockar o loader é o
// que mantém a lógica de 2 passes (exato → fallback por persona) coberta —
// sem isso os testes abaixo passariam vacuamente contra uma lista vazia.
// A ORDEM aqui é o que dá poder ao teste: o match exato (`a-vr`) vem DEPOIS do
// que só casa persona (`a-outro`). Com o exato em primeiro, o fallback do pass
// 2 já devolveria a resposta certa e o pass 1 passaria despercebido — provado
// por mutação: removendo o pass 1, as 4 asserções continuavam verdes.
vi.mock('@/shared/config/dashboard-templates/templates-loader', () => ({
  loadDashboardTemplates: () => [
    { id: 'a-outro', persona: 'diretor-fii-cri', client: 'outro', kpis: [], visuals: [], tables: [] },
    { id: 'a-vr', persona: 'diretor-fii-cri', client: 'vila-rosa', kpis: [], visuals: [], tables: [] },
  ],
}));

describe('selectTemplate', () => {
  it('returns exact match when persona+client pair has template', () => {
    const t = selectTemplate({ personaId: 'diretor-fii-cri', clientId: 'vila-rosa' });
    expect(t).not.toBeNull();
    expect(t!.id).toBe('a-vr');
  });

  it('returns persona-only fallback when client mismatch', () => {
    const t = selectTemplate({ personaId: 'diretor-fii-cri', clientId: 'inexistente' });
    expect(t).not.toBeNull();
    expect(t!.persona).toBe('diretor-fii-cri');
  });

  it('returns null when no match (generic analyst)', () => {
    const t = selectTemplate({ personaId: 'analista-generico', clientId: 'vila-rosa' });
    expect(t).toBeNull();
  });

  it('is deterministic', () => {
    const a = selectTemplate({ personaId: 'diretor-fii-cri', clientId: 'vila-rosa' });
    const b = selectTemplate({ personaId: 'diretor-fii-cri', clientId: 'vila-rosa' });
    expect(a).toEqual(b);
  });
});
