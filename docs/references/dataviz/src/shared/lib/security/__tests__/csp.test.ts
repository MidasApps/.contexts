import { describe, it, expect } from 'vitest';
import {
  buildCsp,
  frameAncestorsDirective,
  cspResponseHeaderName,
  isCspReportOnly,
} from '../csp';

const NONCE = 'AbC123+/dEf456==';

function policy(over: Partial<Parameters<typeof buildCsp>[0]> = {}) {
  return buildCsp({ nonce: NONCE, embedOrigins: [], development: false, ...over });
}

/** Extrai os valores de uma diretiva. `[]` quando a diretiva não existe. */
function directive(csp: string, name: string): string[] {
  const found = csp.split('; ').find((d) => d.split(' ')[0] === name);
  return found ? found.split(' ').slice(1) : [];
}

describe('buildCsp', () => {
  it('carimba o nonce da requisição em script-src', () => {
    expect(directive(policy(), 'script-src')).toContain(`'nonce-${NONCE}'`);
  });

  // Sem `strict-dynamic` o chunk que o Next cria em runtime e o api.js que o
  // Firebase Auth carrega no login com Google são bloqueados — a aplicação
  // sobe em branco e o login com Google morre.
  it("script-src confia no que o script com nonce carrega ('strict-dynamic')", () => {
    expect(directive(policy(), 'script-src')).toContain("'strict-dynamic'");
  });

  // O ponto inteiro da trava. `'unsafe-inline'` em script-src autorizaria
  // qualquer <script> injetado na página, que é exatamente o ataque que o
  // nonce existe para barrar.
  it('NUNCA autoriza script inline sem nonce', () => {
    for (const dev of [true, false]) {
      expect(directive(policy({ development: dev }), 'script-src')).not.toContain("'unsafe-inline'");
    }
  });

  // Estilo inline é outra conversa: Recharts e Radix escrevem `style=` no
  // elemento, e estilo não executa código.
  it('autoriza estilo inline, que é o que os gráficos precisam', () => {
    expect(directive(policy(), 'style-src')).toContain("'unsafe-inline'");
  });

  it("'unsafe-eval' entra em dev (Turbopack) e não vaza para produção", () => {
    expect(directive(policy({ development: true }), 'script-src')).toContain("'unsafe-eval'");
    expect(directive(policy({ development: false }), 'script-src')).not.toContain("'unsafe-eval'");
  });

  // Local o servidor é http; forçar upgrade quebraria toda requisição em dev.
  it('só força https fora de desenvolvimento', () => {
    expect(policy({ development: false })).toContain('upgrade-insecure-requests');
    expect(policy({ development: true })).not.toContain('upgrade-insecure-requests');
  });

  it('websocket do HMR só é liberado em desenvolvimento', () => {
    expect(directive(policy({ development: true }), 'connect-src')).toContain('ws:');
    expect(directive(policy({ development: false }), 'connect-src')).not.toContain('ws:');
  });

  it('libera o que o Firebase Auth e o Firestore precisam alcançar', () => {
    const connect = directive(policy(), 'connect-src');
    expect(connect).toContain('https://*.googleapis.com');
    // Resolver de popup do Firebase abre iframe no domínio do projeto.
    expect(directive(policy(), 'frame-src')).toContain('https://*.firebaseapp.com');
  });

  // `base-uri` é o desvio clássico de `strict-dynamic`: um <base> injetado
  // reescreve a origem de todo script relativo, contornando o nonce.
  it('fecha os desvios de strict-dynamic', () => {
    expect(directive(policy(), 'base-uri')).toEqual(["'self'"]);
    expect(directive(policy(), 'object-src')).toEqual(["'none'"]);
    expect(directive(policy(), 'form-action')).toEqual(["'self'"]);
  });

  // Diretiva repetida não soma: o navegador aplica a PRIMEIRA e ignora a
  // segunda em silêncio. Uma duplicata acidental viraria política morta.
  it('não declara a mesma diretiva duas vezes', () => {
    const names = policy().split('; ').map((d) => d.split(' ')[0]);
    expect(names).toEqual([...new Set(names)]);
  });
});

describe('frameAncestorsDirective', () => {
  it('sem origem configurada, ninguém embute (fail-closed)', () => {
    expect(frameAncestorsDirective([])).toBe("'none'");
  });

  it('com origens, libera as origens e a própria app', () => {
    expect(frameAncestorsDirective(['https://shell.example.com'])).toBe(
      "'self' https://shell.example.com",
    );
  });

  it('a política inteira herda o fail-closed', () => {
    expect(policy()).toContain("frame-ancestors 'none'");
    expect(policy({ embedOrigins: ['https://shell.example.com'] })).toContain(
      "frame-ancestors 'self' https://shell.example.com",
    );
  });
});

describe('modo de aplicação', () => {
  it('bloqueia por padrão — report-only exige opt-in explícito', () => {
    expect(isCspReportOnly({})).toBe(false);
    expect(isCspReportOnly({ CSP_REPORT_ONLY: 'false' })).toBe(false);
    // Só a string exata liga: `CSP_REPORT_ONLY=1` não desarma a trava sem querer.
    expect(isCspReportOnly({ CSP_REPORT_ONLY: '1' })).toBe(false);
    expect(isCspReportOnly({ CSP_REPORT_ONLY: 'true' })).toBe(true);
  });

  it('o nome do header muda com o modo', () => {
    expect(cspResponseHeaderName(false)).toBe('Content-Security-Policy');
    expect(cspResponseHeaderName(true)).toBe('Content-Security-Policy-Report-Only');
  });
});
