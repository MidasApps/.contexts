/**
 * Quem pode falar com o playground: só o próprio navegador desta máquina, na
 * porta do playground.
 *
 * Escutar em `localhost` não basta. O servidor não tem auth, segura credencial
 * de produção e, sem isto, responde `Access-Control-Allow-Origin: *`: qualquer
 * página aberta no navegador do dev poderia chamar
 * `/api/agents/:id/tools/:tool/execute` e ler a resposta. E uma página com DNS
 * rebinding chega pela própria máquina com `Host: evil.example`. Daí as duas
 * checagens:
 *
 * - `Host` tem de ser uma autoridade de loopback NA porta do playground —
 *   derruba DNS rebinding, que manda o Host do domínio do atacante;
 * - `Origin`, quando existe, tem de ser o mesmo loopback — derruba as páginas
 *   de terceiros. Sem `Origin` é navegação/GET same-origin ou o próprio CLI
 *   (`/__refresh`), que não passam de outro site.
 */

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'] as const;
const DEFAULT_PORT = 4111;

/** A porta que o deployer usa: `PORT` do CLI, senão 4111. */
export function playgroundPort(env: Record<string, string | undefined>): number {
  const port = Number(env.PORT);
  return Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT;
}

function allowedAuthorities(port: number): string[] {
  return LOOPBACK_HOSTS.map((h) => `${h}:${port}`);
}

/** Origens do Studio: o mesmo servidor, em http ou (com `--https`) https. */
export function allowedOrigins(port: number): string[] {
  const authorities = allowedAuthorities(port);
  return ['http', 'https'].flatMap((scheme) => authorities.map((a) => `${scheme}://${a}`));
}

export type LoopbackDecision = { ok: true } | { ok: false; reason: string };

export function checkLoopbackRequest(
  headers: { host: string | undefined; origin: string | undefined },
  port: number,
): LoopbackDecision {
  const host = headers.host?.trim().toLowerCase();
  if (!host || !allowedAuthorities(port).includes(host)) {
    return { ok: false, reason: 'host_not_loopback' };
  }
  if (headers.origin !== undefined && !allowedOrigins(port).includes(headers.origin.trim().toLowerCase())) {
    return { ok: false, reason: 'origin_not_allowed' };
  }
  return { ok: true };
}
