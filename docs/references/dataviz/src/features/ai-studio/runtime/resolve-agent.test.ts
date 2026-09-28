import { describe, it, expect, vi, beforeEach } from 'vitest';
const h = vi.hoisted(() => ({ loadAgentConfigMock: vi.fn(), loadSkillPlaybooksMock: vi.fn() }));
vi.mock('./config-loader', () => ({ loadAgentConfig: h.loadAgentConfigMock, loadSkillPlaybooks: h.loadSkillPlaybooksMock }));
import { resolveAgentInstructions } from './resolve-agent';

beforeEach(() => { h.loadAgentConfigMock.mockReset(); h.loadSkillPlaybooksMock.mockReset(); h.loadSkillPlaybooksMock.mockResolvedValue([]); });

describe('resolveAgentInstructions (sem flag)', () => {
  it('config presente → instructions + playbooks', async () => {
    h.loadAgentConfigMock.mockResolvedValue({ instructions: 'CFG', skillRefs: ['s1'] });
    h.loadSkillPlaybooksMock.mockResolvedValue(['## Skill: S1\nP1']);
    expect(await resolveAgentInstructions('descriptive', 'CODE')).toBe('CFG\n\n## Skill: S1\nP1');
  });
  it('config ausente/vazia → codeFallback', async () => {
    h.loadAgentConfigMock.mockResolvedValue(null);
    expect(await resolveAgentInstructions('descriptive', 'CODE')).toBe('CODE');
    h.loadAgentConfigMock.mockResolvedValue({ instructions: '   ' });
    expect(await resolveAgentInstructions('descriptive', 'CODE')).toBe('CODE');
  });
  it('erro → codeFallback (resiliente)', async () => {
    h.loadAgentConfigMock.mockRejectedValue(new Error('firestore down'));
    expect(await resolveAgentInstructions('descriptive', 'CODE')).toBe('CODE');
  });
});
