import type { NextConfig } from 'next';
import { getAllowedEmbedOrigins } from './src/features/auth/lib/embed-origin';
import { frameAncestorsDirective } from './src/shared/lib/security/csp';

/**
 * Cabeçalhos de segurança (achado R18 da revisão de 2026-08-04 — só o COOP
 * existia).
 *
 * `frame-ancestors` em vez de `X-Frame-Options`: este produto roda DENTRO de
 * iframe por design (modo embedded, token via postMessage do shell pai). Um
 * `X-Frame-Options: DENY` quebraria o produto, e o `ALLOW-FROM` nunca teve
 * suporte real. O CSP expressa a allowlist que a aplicação já mantém — a mesma
 * de `getAllowedEmbedOrigins()`, para não haver duas listas divergentes.
 *
 * Fail-closed: sem `NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS`, `frame-ancestors 'none'`.
 * É a mesma postura que `isAllowedEmbedOrigin` já toma no cliente — sem env, o
 * postMessage do pai é rejeitado, então o iframe não funcionaria de todo modo.
 *
 * O RESTO da política (`script-src` e companhia) vive em `middleware.ts`, não
 * aqui: `script-src` exige um nonce diferente por requisição e header de
 * `next.config.ts` é estático. Este arquivo mantém só `frame-ancestors`, que é
 * fixo e precisa valer TAMBÉM nas respostas que o middleware não intercepta
 * (assets de `_next/static`).
 *
 * Não há política dobrada: onde o middleware roda, o header dele SUBSTITUI
 * este (mesmo nome, `headers.set`) — e a política do middleware já declara
 * `frame-ancestors`. Verificado no build de produção: documento sai com um
 * header só; `/_next/static/*` sai com este aqui.
 */
function securityHeaders() {
  const frameAncestors = frameAncestorsDirective(getAllowedEmbedOrigins());

  return [
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
    // Impede o browser de adivinhar o Content-Type — relevante aqui porque
    // /api/download serve arquivo binário por rota dinâmica.
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // Não vaza path do relatório (que carrega id de cliente) para terceiros.
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Content-Security-Policy', value: `frame-ancestors ${frameAncestors}` },
    // Browsers ignoram HSTS vindo de origem não-segura, então localhost não é
    // afetado; ainda assim fica restrito a produção para não haver surpresa em
    // ambiente servido por http.
    ...(process.env.NODE_ENV === 'production'
      ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
      : []),
  ];
}

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders(),
      },
    ];
  },
};

export default nextConfig;
