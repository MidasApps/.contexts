/**
 * Entry do CLI do Mastra — SÓ para o playground local (`pnpm mastra:dev`).
 *
 * O app NÃO importa nada de `src/mastra/`: em produção o `Mastra` é montado por
 * requisição em `features/ai-agents/mastra/instance.ts` e servido por
 * `/api/chat` (ADR-0019), com auth e checagem de tenant. Este servidor não tem
 * nenhuma das duas; por isso escuta só em `localhost`, aceita só Host/Origin de
 * loopback (`loopback-guard.ts`), fixa um cliente vindo do env e recusa subir
 * contra o banco de produção sem opt-in.
 *
 * Ordem importa: a guarda de banco roda antes do `import()` dos agentes, então
 * uma subida recusada não abre conexão com o Firestore nem com o BigQuery.
 */
import { Mastra } from '@mastra/core';
import type { Middleware } from '@mastra/core/server';
import { decidePlaygroundStart, readPlaygroundConfig } from './playground-config';
import { allowedOrigins, checkLoopbackRequest, playgroundPort } from './loopback-guard';

const config = readPlaygroundConfig(process.env);
const decision = decidePlaygroundStart(config);
if (!decision.ok) {
  console.error(`[mastra-playground] RECUSADO: ${decision.reason}`);
  process.exit(2);
}

const port = playgroundPort(process.env);

type MiddlewareHandler = Exclude<Middleware, { path: string }>;

/**
 * Recusa antes de qualquer rota. Registrado por `setServerMiddleware`, que o
 * deployer monta ANTES do middleware de CORS (`createHonoServer`): assim até o
 * preflight OPTIONS de outra origem leva 403, em vez de um 204 do CORS.
 */
const loopbackOnly: MiddlewareHandler = async (c, next) => {
  const verdict = checkLoopbackRequest(
    { host: c.req.header('host'), origin: c.req.header('origin') },
    port,
  );
  if (!verdict.ok) {
    console.warn(JSON.stringify({
      level: 'warn',
      msg: 'mastra_playground_request_refused',
      reason: verdict.reason,
      method: c.req.method,
      path: c.req.path,
    }));
    return c.json({ code: 'FORBIDDEN', reason: verdict.reason }, 403);
  }
  await next();
};

const { buildPlaygroundAgents } = await import('./playground-agents');

export const mastra = new Mastra({
  agents: await buildPlaygroundAgents(config),
  server: {
    host: 'localhost',
    // Default do deployer sem auth é `*`. Só o Studio, servido por este mesmo
    // servidor, precisa ler as respostas.
    cors: { origin: allowedOrigins(port) },
  },
});

mastra.setServerMiddleware([{ path: '*', handler: loopbackOnly }]);
