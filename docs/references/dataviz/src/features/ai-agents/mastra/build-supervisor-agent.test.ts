import { describe, it, expect, vi, beforeEach } from 'vitest';
const h = vi.hoisted(() => ({ resolveInstrMock: vi.fn(), staticMock: vi.fn(), dynMock: vi.fn(), getModelMock: vi.fn() }));
vi.mock('@/features/ai-studio/runtime/resolve-agent', () => ({ resolveAgentInstructions: h.resolveInstrMock }));
vi.mock('@/shared/config/agents', () => ({ buildOrchestratorStatic: h.staticMock }));
vi.mock('@/shared/config/agents/dynamic-context', () => ({ buildOrchestratorDynamicContext: h.dynMock }));
vi.mock('@/features/ai-agents/model-registry', () => ({ getModel: h.getModelMock, MAX_MODEL_RETRIES: 5 }));
vi.mock('@mastra/core/agent', () => ({ Agent: vi.fn(function (cfg: unknown) { return { cfg }; }) }));
import { buildSupervisorAgent } from './build-supervisor-agent';
import { Agent } from '@mastra/core/agent';
import type { CanvasPageContext } from '@/shared/config/agents/types';

const ctx = { page: '/dashboard', dataset: 'om', clientId: 'vila-rosa', filters: {}, sessionId: 's' } as never;

function lastConfig() {
  return (Agent as unknown as { mock: { calls: Array<[Record<string, unknown>]> } }).mock.calls.at(-1)![0];
}

beforeEach(() => {
  Object.values(h).forEach((m) => m.mockReset());
  h.resolveInstrMock.mockResolvedValue('ORCH'); h.staticMock.mockReturnValue('ORCH_STATIC');
  h.dynMock.mockReturnValue('ORCH_DYN'); h.getModelMock.mockReturnValue('ROUTER');
  (Agent as unknown as { mockClear: () => void }).mockClear();
});

describe('buildSupervisorAgent', () => {
  it('instructions = orchestrator(config) + workflow + autoria + dynamic, nessa ordem', async () => {
    await buildSupervisorAgent({ instruction: 'WF', ctx, subAgents: { descriptive: 'D' } });
    const cfg = lastConfig();
    const instr = String(cfg.instructions);

    expect(instr.startsWith('ORCH\n\nWF\n\n')).toBe(true);
    expect(instr.endsWith('\n\nORCH_DYN')).toBe(true);
    expect(instr).toContain('## Construir e editar páginas');
    expect(cfg.id).toBe('supervisor');
    expect(h.resolveInstrMock).toHaveBeenCalledWith('orchestrator', 'ORCH_STATIC');
    expect(cfg.agents).toEqual({ descriptive: 'D' });
    expect(cfg.model).toBe('ROUTER');
    // `fast`, não `router`: ele deixou de só rotear. O flash-lite duplica blocos
    // em 2 de 3 rodadas, e thinking zero deu falha intermitente de tool-calling.
    // Ver o comentário de `TIER_DO_SUPERVISOR`.
    expect(h.getModelMock).toHaveBeenCalledWith('fast');
  });

  /*
   * 429 do Vertex (`RESOURCE_EXHAUSTED` no endpoint `global`) é capacidade
   * compartilhada: some em segundos e volta. Com as 2 tentativas padrão do
   * SDK o turno morria antes disso, e o usuário perdia o pedido inteiro —
   * prompt, contexto semântico e memória já gastos.
   */
  it('insiste com o provedor mais do que o padrão do SDK', async () => {
    await buildSupervisorAgent({ instruction: 'WF', ctx, subAgents: {} });
    expect(Number(lastConfig().maxRetries)).toBeGreaterThan(2);
  });

  /**
   * O supervisor só tinha `agents:` — analisava e nada mais. Quem construía
   * página era o orquestrador de canvas, atrás de outra rota, alcançável só no
   * modo de edição; daí o assistente geral responder que "não tem a
   * funcionalidade de criar páginas".
   */
  it('recebe as tools de autoria junto com os sub-agentes', async () => {
    await buildSupervisorAgent({ instruction: 'WF', ctx, subAgents: { descriptive: 'D' } });
    const tools = lastConfig().tools as Record<string, unknown>;

    expect(Object.keys(tools)).toContain('create_report_page');
    expect(Object.keys(tools)).toContain('add_kpi_block');
    expect(Object.keys(tools)).toContain('update_chart_block');
    // Análise continua sendo delegação a sub-agente, não tool.
    expect(lastConfig().agents).toEqual({ descriptive: 'D' });
  });

  it('leva o inventário de blocos da página aberta para o prompt', async () => {
    const pagesContext: CanvasPageContext[] = [{
      id: 'p', title: 'Empreendimento',
      blocks: [{ id: 'kpi-emp-vgv', type: 'kpi', label: 'Projeto VGV' }],
      layout: [{ rowIndex: 0, blockIds: ['kpi-emp-vgv'] }],
    }];
    await buildSupervisorAgent({ instruction: 'WF', ctx, subAgents: {}, pagesContext, selectedBlockIds: ['kpi-emp-vgv'] });
    const instr = String(lastConfig().instructions);

    expect(instr).toContain('[kpi-emp-vgv] kpi | "Projeto VGV"');
    expect(instr).toMatch(/APENAS estes blocos/i);
  });
});
