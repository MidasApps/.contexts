/**
 * Allowlist de origens permitidas para o modo embedded (iframe com token do
 * shell pai). Fail-closed: sem env configurada, nenhuma origem é aceita.
 * Env: NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS = lista separada por vírgula.
 */
export function getAllowedEmbedOrigins(): string[] {
  return (process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export function isAllowedEmbedOrigin(origin: string): boolean {
  return getAllowedEmbedOrigins().includes(origin);
}
