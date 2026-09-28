/**
 * Launcher do playground local do Mastra (`pnpm mastra:dev`).
 *
 * Por que não chamar `mastra dev` direto no script do package.json:
 *
 * 1. Guarda com código de saída. A entry (`src/mastra/index.ts`) recusa o banco
 *    de produção sem opt-in, mas ela roda no processo FILHO do CLI; o CLI pai
 *    fica vivo em modo watch e o comando nunca termina com erro. Aqui a mesma
 *    decisão roda antes, e uma recusa sai com 2. A guarda da entry continua lá
 *    como fonte de verdade — é ela que vê o env com que o servidor sobe.
 * 2. Telemetria. `MASTRA_TELEMETRY_DISABLED=1` precisa estar no env do CLI
 *    antes de ele iniciar; `VAR=1 cmd` no script não funciona no cmd do
 *    Windows, e o projeto não tem `cross-env`.
 *
 * Precedência de env igual à do CLI: o `.env.local` SOBRESCREVE o shell (o CLI
 * faz `process.env[k] = v` para cada chave do arquivo), então a guarda daqui vê
 * o mesmo banco que o servidor vai ver.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { decidePlaygroundStart, readPlaygroundConfig } from '../src/mastra/playground-config';

const ENV_FILE = '.env.local';

// `MASTRA_SKIP_DOTENV` é o mesmo interruptor que o CLI respeita (`shouldSkipDotenvLoading`).
const skipDotenv = ['1', 'true'].includes(process.env.MASTRA_SKIP_DOTENV ?? '');
const fromFile = !skipDotenv && existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, 'utf8')) : {};
const effectiveEnv = { ...process.env, ...fromFile };

const decision = decidePlaygroundStart(readPlaygroundConfig(effectiveEnv));
if (!decision.ok) {
  console.error(`[mastra-playground] RECUSADO: ${decision.reason}`);
  process.exit(2);
}

const require = createRequire(import.meta.url);
const mastraBin = path.join(path.dirname(require.resolve('mastra/package.json')), 'dist/index.js');

const child = spawn(
  process.execPath,
  [mastraBin, 'dev', '--env', ENV_FILE, ...process.argv.slice(2)],
  { stdio: 'inherit', env: { ...process.env, MASTRA_TELEMETRY_DISABLED: '1' } },
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
