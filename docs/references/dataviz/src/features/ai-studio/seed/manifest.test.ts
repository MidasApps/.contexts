import { describe, it, expect } from 'vitest';
import { SYSTEM_SEEDS } from './manifest';
import { DEFAULT_AGENT_TOOLS } from '@/shared/config/agents/default-agent-tools';

const byType = (t: string) => SYSTEM_SEEDS.filter((s) => s.type === t);

describe('SYSTEM_SEEDS', () => {
  it('tem 9 agentes, 4 skills, 1 workflow, 1 KB', () => {
    expect(byType('agent')).toHaveLength(9);
    expect(byType('skill')).toHaveLength(4);
    expect(byType('workflow')).toHaveLength(1);
    expect(byType('knowledgeBase')).toHaveLength(1);
  });

  it('instruções dos agentes são completas (não one-liner)', () => {
    for (const a of byType('agent')) {
      expect(String(a.doc.instructions).length).toBeGreaterThan(200);
    }
  });

  it('os 8 sub-agentes referenciam as 4 skills; orchestrator não', () => {
    const skills = ['response-style', 'sql-foundations', 'portfolio-schema', 'credit-domain'];
    for (const a of byType('agent')) {
      if (a.id === 'orchestrator') { expect(a.doc.skillRefs).toEqual([]); continue; }
      expect([...(a.doc.skillRefs as string[])].sort()).toEqual([...skills].sort());
    }
  });

  it('model usa tiers válidos (router/fast/reasoning)', () => {
    const tiers = new Set(byType('agent').map((a) => a.doc.model));
    for (const t of tiers) expect(['router', 'fast', 'reasoning']).toContain(t);
    expect(SYSTEM_SEEDS.find((s) => s.id === 'diagnostic')!.doc.model).toBe('reasoning');
    expect(SYSTEM_SEEDS.find((s) => s.id === 'descriptive')!.doc.model).toBe('fast');
    expect(SYSTEM_SEEDS.find((s) => s.id === 'orchestrator')!.doc.model).toBe('router');
  });

  it('sub-agentes têm toolRefs = DEFAULT_AGENT_TOOLS; orchestrator vazio; skills vazias', () => {
    for (const a of SYSTEM_SEEDS.filter((s) => s.type === 'agent')) {
      if (a.id === 'orchestrator') { expect(a.doc.toolRefs).toEqual([]); continue; }
      expect((a.doc.toolRefs as string[]).length).toBeGreaterThan(0);
      expect(a.doc.toolRefs).toEqual(DEFAULT_AGENT_TOOLS[a.id]);
    }
    for (const s of SYSTEM_SEEDS.filter((s) => s.type === 'skill')) expect(s.doc.toolRefs).toEqual([]);
  });

  it('skills carregam o playbook canônico', () => {
    const credit = SYSTEM_SEEDS.find((s) => s.type === 'skill' && s.id === 'credit-domain')!;
    expect(String(credit.doc.playbook)).toContain('Glossário de termos');
    const sql = SYSTEM_SEEDS.find((s) => s.type === 'skill' && s.id === 'sql-foundations')!;
    expect(String(sql.doc.playbook)).toContain('APENAS SELECT');
  });
});
