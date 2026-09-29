import { describe, it, expect } from 'vitest';
import { AiEnvelopeBase, AiOrigin, AiStatus } from './common';
import { AiAgentDoc } from './agent';
import { AiSkillDoc } from './skill';
import { AiWorkflowDoc } from './workflow';
import { KnowledgeBaseDoc } from './knowledge-base';

describe('AiEnvelopeBase', () => {
  it('aplica defaults de status/origin', () => {
    const parsed = AiEnvelopeBase.parse({ name: 'X' });
    expect(parsed.status).toBe('active');
    expect(parsed.origin).toBe('user');
    expect(parsed.description).toBe('');
  });
  it('rejeita name vazio', () => {
    expect(AiEnvelopeBase.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('AiAgentDoc', () => {
  it('default model=fast, kind=worker, refs vazios', () => {
    const a = AiAgentDoc.parse({ name: 'Descriptive' });
    expect(a.model).toBe('fast');
    expect(a.kind).toBe('worker');
    expect(a.skillRefs).toEqual([]);
    expect(a.toolRefs).toEqual([]);
    expect(a.knowledgeBaseRefs).toEqual([]);
  });
  it('rejeita model inválido', () => {
    expect(AiAgentDoc.safeParse({ name: 'X', model: 'gpt' }).success).toBe(false);
  });
});

describe('AiSkillDoc', () => {
  it('default playbook vazio + refs', () => {
    const s = AiSkillDoc.parse({ name: 'Safra' });
    expect(s.playbook).toBe('');
    expect(s.toolRefs).toEqual([]);
  });
});

describe('AiWorkflowDoc', () => {
  it('default isDefault=false', () => {
    const w = AiWorkflowDoc.parse({ name: 'Default' });
    expect(w.isDefault).toBe(false);
    expect(w.instruction).toBe('');
  });
});

describe('KnowledgeBaseDoc', () => {
  it('clientId default null + embeddingModel + contadores 0', () => {
    const k = KnowledgeBaseDoc.parse({ name: 'Mercado SBPE' });
    expect(k.clientId).toBeNull();
    expect(k.embeddingModel).toBe('gemini-embedding-001');
    expect(k.docCount).toBe(0);
  });
});

// KnowledgeBaseSourceDoc saiu junto com knowledge-base-doc.ts: era um contrato
// declarado que ninguém aplicava — a rota de upload
// (app/api/ai-studio/kb/[id]/docs) valida extensão e tamanho à mão e grava o
// doc sem passar por Zod. Se o schema voltar, é junto com a rota usando ele.

it('enums expõem valores esperados', () => {
  expect(AiStatus.options).toEqual(['active', 'draft', 'archived']);
  expect(AiOrigin.options).toEqual(['system', 'user']);
});
