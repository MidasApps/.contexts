/**
 * Content-Security-Policy da aplicação — a política inteira, num lugar só.
 *
 * Até aqui o CSP tinha uma diretiva (`frame-ancestors`, em `next.config.ts`).
 * `script-src` ficou de fora de propósito: o App Router injeta script inline em
 * toda página, e um `script-src` sem nonce bloqueia o próprio framework — a
 * aplicação sobe em branco. O nonce precisa mudar a cada requisição, e header
 * de `next.config.ts` é estático. Por isso a política mora aqui e é aplicada
 * pelo `proxy.ts`, que roda por requisição.
 *
 * ─── Por que `strict-dynamic` ────────────────────────────────────────────────
 * O Next carrega chunks criando `<script>` em runtime, e o SDK do Firebase Auth
 * carrega `apis.google.com/js/api.js` do mesmo jeito no login com Google. Uma
 * allowlist de host não cobre isso sem virar uma lista de domínios que envelhece
 * mal. Com `strict-dynamic`, script carregado POR script confiável (nonce)
 * herda a confiança, e a allowlist deixa de ser necessária — o navegador ignora
 * `https:` quando entende `strict-dynamic`.
 *
 * O `https:` fica como fallback para navegador que entende nonce (CSP2, ~2015)
 * mas não `strict-dynamic` (CSP3): lá a política vira `'self' nonce https:`, o
 * login com Google continua funcionando e inline sem nonce continua bloqueado.
 * NÃO há `'unsafe-inline'` na lista — ele só serviria a navegador pré-2015, e
 * o custo seria devolver ao atacante exatamente o que esta trava tira.
 */

export interface CspOptions {
  /** Nonce da requisição, em base64. Gerado pelo proxy. */
  nonce: string;
  /** Origens autorizadas a embutir a app em iframe (modo embedded). */
  embedOrigins: string[];
  /** `true` sob `next dev`: Turbopack usa `eval` e HMR fala por websocket. */
  development: boolean;
}

/**
 * `frame-ancestors` — quem pode embutir a app em iframe.
 *
 * Fail-closed: sem origem configurada, `'none'`. É a mesma postura que
 * `isAllowedEmbedOrigin` toma no cliente, então uma origem fora da lista já não
 * conseguiria autenticar de todo modo.
 */
export function frameAncestorsDirective(embedOrigins: string[]): string {
  return embedOrigins.length > 0 ? `'self' ${embedOrigins.join(' ')}` : "'none'";
}

export function buildCsp({ nonce, embedOrigins, development }: CspOptions): string {
  const directives: string[] = [
    "default-src 'self'",
    // `base-uri` fecha o desvio clássico de `strict-dynamic`: um `<base>`
    // injetado reescreveria a origem de todo script relativo da página.
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestorsDirective(embedOrigins)}`,

    [
      'script-src',
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      'https:',
      // Turbopack compila módulo com `eval` em dev. Em produção não entra.
      ...(development ? ["'unsafe-eval'"] : []),
    ].join(' '),

    // `'unsafe-inline'` aqui não é folga: Recharts e Radix escrevem `style=`
    // direto no elemento (posição de tooltip, altura de accordion). Sem isso o
    // gráfico renderiza fora de lugar. Estilo inline não executa código — o
    // risco que ele carrega é de aparência, não de execução.
    "style-src 'self' 'unsafe-inline'",

    // `https:` porque o avatar vem do provedor de identidade (URL arbitrária do
    // Google/Firebase); `blob:` para gráfico exportado como imagem.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",

    [
      'connect-src',
      "'self'",
      // Firebase Auth (identitytoolkit, securetoken) e Firestore no cliente.
      'https://*.googleapis.com',
      'https://*.google.com',
      // HMR do `next dev` fala websocket com o próprio host.
      ...(development ? ['ws:', 'wss:'] : []),
    ].join(' '),

    // O resolver de popup do Firebase Auth abre um iframe no domínio do projeto.
    "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",

    "worker-src 'self' blob:",
    "manifest-src 'self'",

    // Em dev o servidor é http; ligar isso local quebraria toda requisição.
    ...(development ? [] : ['upgrade-insecure-requests']),
  ];

  return directives.join('; ');
}

/**
 * Modo de aplicação da política.
 *
 * `report-only` manda o navegador reportar a violação sem bloquear nada — é o
 * que se usa na janela de observação em homologação, quando o custo de um
 * bloqueio errado é maior que o de uma violação não bloqueada. Fora dessa
 * janela o padrão é bloquear: uma trava que só avisa não é uma trava.
 *
 * `env` é `Record<string, string | undefined>` e não `NodeJS.ProcessEnv` pelo
 * mesmo motivo que `shouldPersistFromEnv` em `features/evals/drift`: o Next
 * aumenta `ProcessEnv` com `NODE_ENV` obrigatório, e testar com objeto literal
 * quebraria o type-check.
 */
export function isCspReportOnly(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.CSP_REPORT_ONLY === 'true';
}

export function cspResponseHeaderName(reportOnly: boolean): string {
  return reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
}
