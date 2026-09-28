import { describe, it, expect, vi, beforeEach } from 'vitest';
const h = vi.hoisted(() => ({ loadAgentConfigMock: vi.fn(), loadSkillsMock: vi.fn() }));
vi.mock('./config-loader', () => ({ loadAgentConfig: h.loadAgentConfigMock, loadSkills: h.loadSkillsMock }));
import { resolveAgentCapabilities } from './resolve-capabilities';

beforeEach(() => { h.loadAgentConfigMock.mockReset(); h.loadSkillsMock.mockReset(); h.loadSkillsMock.mockResolvedValue([]); });

describe('resolveAgentCapabilities (sem flag)', () => {
  it('une agent ∪ skill toolRefs/kbRefs', async () => {
    h.loadAgentConfigMock.mockResolvedValue({ toolRefs: ['t1'], knowledgeBaseRefs: ['kb1'], skillRefs: ['s1'] });
    h.loadSkillsMock.mockResolvedValue([{ toolRefs: ['t2'], knowledgeBaseRefs: ['kb2'] }]);
    const caps = await resolveAgentCapabilities('descriptive');
    expect([...caps.toolKeys].sort()).toEqual(['t1', 't2']);
    expect([...caps.kbRefs].sort()).toEqual(['kb1', 'kb2']);
  });
  it('dedup: ref repetida entre agent e skill aparece uma vez', async () => {
    h.loadAgentConfigMock.mockResolvedValue({ toolRefs: ['t1'], knowledgeBaseRefs: ['kb1'], skillRefs: ['s1'] });
    h.loadSkillsMock.mockResolvedValue([{ toolRefs: ['t1', 't2'], knowledgeBaseRefs: ['kb1', 'kb2'] }]);
    const caps = await resolveAgentCapabilities('descriptive');
    expect([...caps.toolKeys].sort()).toEqual(['t1', 't2']);
    expect([...caps.kbRefs].sort()).toEqual(['kb1', 'kb2']);
  });
  it('toolRefs vazias → vazio', async () => {
    h.loadAgentConfigMock.mockResolvedValue({ toolRefs: [], knowledgeBaseRefs: [], skillRefs: [] });
    expect(await resolveAgentCapabilities('descriptive')).toEqual({ toolKeys: [], kbRefs: [] });
  });
  it('erro → vazio (fail-soft)', async () => {
    h.loadAgentConfigMock.mockRejectedValue(new Error('x'));
    expect(await resolveAgentCapabilities('descriptive')).toEqual({ toolKeys: [], kbRefs: [] });
  });
});
