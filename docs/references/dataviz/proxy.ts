import { NextResponse, type NextRequest } from 'next/server';
import { getAllowedEmbedOrigins } from '@/features/auth/lib/embed-origin';
import { buildCsp, cspResponseHeaderName, isCspReportOnly } from '@/shared/lib/security/csp';

/**
 * Aplica o Content-Security-Policy com nonce por requisição.
 *
 * Arquivo `proxy.ts`, não `middleware.ts`: o Next 16 renomeou a convenção e
 * avisa em toda inicialização com o nome antigo. O conteúdo é o mesmo — só a
 * função deixa de se chamar `middleware`.
 *
 * O nonce precisa ser diferente a cada resposta — reaproveitá-lo devolveria ao
 * atacante o valor que autoriza script. Por isso a política não pode morar em
 * `next.config.ts` (header estático) e vive aqui.
 *
 * O header entra em DOIS lugares, e os dois importam:
 *
 *  - no REQUEST (`content-security-policy`): é daí que o Next lê o nonce para
 *    carimbar nos `<script>` que ele mesmo injeta. Sem isso o framework é a
 *    primeira coisa que a própria política bloqueia. O navegador nunca vê este
 *    header — ele só existe entre o middleware e o renderizador.
 *  - na RESPONSE: é o que o navegador aplica.
 *
 * No modo report-only o header de request continua sendo o normal (é o único
 * nome que o Next lê); só o da resposta muda de nome.
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildCsp({
    nonce,
    embedOrigins: getAllowedEmbedOrigins(),
    development: process.env.NODE_ENV !== 'production',
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(cspResponseHeaderName(isCspReportOnly()), csp);
  return response;
}

export const config = {
  matcher: [
    {
      /*
       * Assets de `_next/static` ficam de fora: são imutáveis, não executam
       * script inline e continuam cobertos pelo `frame-ancestors` estático de
       * `next.config.ts`.
       */
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      /*
       * Prefetch do router fica de fora porque a resposta é cacheada pelo
       * cliente: um nonce cacheado vale para uma requisição e falha na
       * seguinte. Documento navegado sempre passa por aqui.
       */
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
