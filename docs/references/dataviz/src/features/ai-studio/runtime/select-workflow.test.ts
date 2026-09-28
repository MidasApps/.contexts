import { describe, it, expect, vi, beforeEach } from 'vitest';

const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
vi.mock('ai', () => ({ generateObject: generateObjectMock }));
vi.mock('@/features/ai-agents/model-registry', () => ({ getModel: () => 'ROUTER_MODEL' }));

import { selectWorkflow } from './select-workflow';
import type { AiStudioRecord } from '../repo';

const wfs = [
  { id: 'default', status: 'active', isDefault: true, instruction: 'i-def', description: 'fluxo padrão' },
  { id: 'inadimplencia', status: 'active', isDefault: false, instruction: 'i-inad', description: 'quando o comando é sobre inadimplência/atraso' },
] as unknown as AiStudioRecord[];

beforeEach(() => generateObjectMock.mockReset());

describe('selectWorkflow', () => {
  it('um único workflow → retorna sem chamar o LLM', async () => {
    const out = await selectWorkflow('qualquer', [wfs[0]]);
    expect(out.id).toBe('default');
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it('casa pelo id retornado pelo roteador', async () => {
    generateObjectMock.mockResolvedValueOnce({ object: { workflowId: 'inadimplencia' } });
    const out = await selectWorkflow('por que a inadimplência subiu?', wfs);
    expect(out.id).toBe('inadimplencia');
  });

  it('id inválido → fallback ao default', async () => {
    generateObjectMock.mockResolvedValueOnce({ object: { workflowId: 'nao-existe' } });
    const out = await selectWorkflow('x', wfs);
    expect(out.id).toBe('default');
  });

  it('erro do roteador → fallback ao default (fail-soft)', async () => {
    generateObjectMock.mockRejectedValueOnce(new Error('vertex down'));
    const out = await selectWorkflow('x', wfs);
    expect(out.id).toBe('default');
  });

  it('sem default → fallback ao 1º ativo', async () => {
    generateObjectMock.mockRejectedValueOnce(new Error('down'));
    const noDefault = [{ ...wfs[1] }, { id: 'b', status: 'active', isDefault: false, instruction: '', description: 'b' }] as unknown as AiStudioRecord[];
    const out = await selectWorkflow('x', noDefault);
    expect(out.id).toBe('inadimplencia');
  });
});
