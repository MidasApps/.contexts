/**
 * Parte pura do `scripts/bootstrap-user.ts` — mesma separação que
 * `grant-claims-args.ts` faz: o script roda `main()` no import, então o que
 * merece teste mora fora dele.
 */

export interface BootstrapArgs {
  email: string;
  database: string;
  /** Projeto GCP. Ausente ⇒ cai nas env vars; ver `resolveProject`. */
  project?: string;
  /** `undefined` = todos os que existirem no banco. */
  clients?: string[];
  groups?: string[];
  name?: string;
  password?: string;
  role?: string;
  dryRun: boolean;
  force: boolean;
  allowProd: boolean;
}

export function parseBootstrapArgs(argv: string[]): BootstrapArgs {
  const value = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const list = (n: string) => {
    const raw = value(n);
    if (raw === undefined) return undefined;
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  };

  return {
    email: value('email') ?? '',
    database: value('database') ?? '',
    project: value('project'),
    clients: list('clients'),
    groups: list('groups'),
    name: value('name'),
    password: value('password'),
    role: value('role'),
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    allowProd: argv.includes('--allow-prod'),
  };
}

export type IdResolution =
  | { ok: true; ids: string[] }
  | { ok: false; missing: string[] };

/**
 * Resolve o que foi pedido contra o que existe no banco.
 *
 * Id inexistente não dá erro no Firestore — ele grava a string e o acesso
 * simplesmente não acontece. Recusar aqui é a diferença entre "não funcionou" e
 * "não funcionou por causa do typo em `vila-roza`".
 *
 * Sem pedido explícito, devolve tudo o que existe: num ambiente recém-criado é
 * exatamente o que o primeiro usuário precisa.
 */
export function resolverIds(
  requested: string[] | undefined,
  existing: string[],
): IdResolution {
  if (!requested) return { ok: true, ids: existing };
  const missing = requested.filter((p) => !existing.includes(p));
  return missing.length > 0 ? { ok: false, missing } : { ok: true, ids: requested };
}
