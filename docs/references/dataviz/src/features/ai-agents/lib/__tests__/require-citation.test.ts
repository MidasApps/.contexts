import { describe, it, expect } from 'vitest';
import {
  checkCitations,
  annotateMissingCitations,
  MISSING_SOURCE_WARNING,
} from '../require-citation';
import { parseClaims } from '@/shared/lib/claims/claim-patterns';

describe('parseClaims', () => {
  it('reconhece afirmação numérica e regulatória', () => {
    expect(parseClaims('A inadimplência foi de 12,5%')).toContain('12,5%');
    expect(parseClaims('Saldo de R$ 1.250.000 na carteira')).toContain('R$ 1.250.000');
    expect(parseClaims('conforme a Res. 4.966')).toContain('Res. 4.966');
    expect(parseClaims('subiu 150 bps')).toContain('150 bps');
  });

  it('texto sem número nem norma não tem claim', () => {
    expect(parseClaims('A carteira apresentou melhora relevante.')).toEqual([]);
  });

  // Regex global é stateful: sem zerar lastIndex a segunda chamada pula
  // matches, e o guardrail passaria a deixar texto sem marcar de forma
  // intermitente — o pior modo de falha possível aqui.
  it('é estável entre chamadas repetidas', () => {
    const t = 'inadimplência de 3% e LTV de 60%';
    expect(parseClaims(t)).toEqual(parseClaims(t));
    expect(parseClaims(t)).toHaveLength(2);
  });
});

describe('checkCitations', () => {
  it('número sem fonte precisa de aviso', () => {
    expect(checkCitations('A inadimplência foi de 12,5%.').needsWarning).toBe(true);
  });

  it.each([
    'A inadimplência foi de 12,5%. Fonte: carteira Vila Rosa, jul/2026.',
    'Conforme a Lei 9.514, o índice é de 8%.',
    'A inadimplência foi de 12,5%, segundo a apuração de julho.',
    'Baseado nos dados da base, o LTV médio é 62%.',
    'Inadimplência de 4% ([relatório](https://x/y)).',
  ])('texto com sinal de fonte não precisa de aviso: %s', (t) => {
    expect(checkCitations(t).needsWarning).toBe(false);
  });

  it('texto sem afirmação numérica nunca precisa de aviso', () => {
    expect(checkCitations('A carteira melhorou no trimestre.').needsWarning).toBe(false);
  });
});

describe('annotateMissingCitations', () => {
  it('anexa o aviso quando falta fonte', () => {
    const out = annotateMissingCitations('Inadimplência de 12,5%.');
    expect(out).toContain('Inadimplência de 12,5%.');
    expect(out).toContain(MISSING_SOURCE_WARNING);
  });

  it('MARCA, não recusa — o conteúdo original é preservado inteiro', () => {
    const original = 'Análise longa com 12,5% e outros detalhes relevantes.';
    expect(annotateMissingCitations(original).startsWith(original)).toBe(true);
  });

  it('não mexe em texto que já cita fonte', () => {
    const t = 'Inadimplência de 12,5%. Fonte: base de contratos.';
    expect(annotateMissingCitations(t)).toBe(t);
  });

  it('não mexe em texto sem afirmação numérica', () => {
    const t = 'A carteira melhorou.';
    expect(annotateMissingCitations(t)).toBe(t);
  });

  // O bloco pode ser regerado e reprocessado; empilhar avisos poluiria a tela.
  it('é idempotente', () => {
    const one = annotateMissingCitations('Inadimplência de 12,5%.');
    const two = annotateMissingCitations(one);
    expect(two).toBe(one);
  });

  it.each(['', '   '])('texto vazio passa intacto (%j)', (t) => {
    expect(annotateMissingCitations(t)).toBe(t);
  });
});
