/**
 * No-op de `server-only` para scripts rodados por `tsx`.
 *
 * O pacote real do Next **lança de propósito** quando importado fora de um
 * Server Component — é essa a função dele: impedir que módulo de servidor vaze
 * para o bundle do cliente. Ótimo no build do Next, fatal num script Node, que
 * não tem a distinção server/client para oferecer.
 *
 * Só o `tsconfig.scripts.json` mapeia `server-only` para cá. O build do app
 * continua usando o pacote de verdade, com a proteção intacta.
 */
export {};
