import 'server-only';

/**
 * Freio das operações caras: chat analítico, geração de painel e export de PDF.
 *
 * Achado R4 da revisão de 2026-08-04: não havia NENHUM `429` no repositório. As
 * três rotas acima rodam por minutos e a de PDF sobe um Chrome por request —
 * uma tela em laço de repetição ocupava o servidor e gerava custo sem nada
 * interromper.
 *
 * ─── O que este módulo NÃO faz ──────────────────────────────────────────────
 * A contagem vive na MEMÓRIA DO PROCESSO. Quando o serviço escala para N
 * instâncias, cada uma tem seu próprio contador e o limite efetivo é N× o
 * configurado. Isto é uma escolha consciente de MVP: sem dependência nova, sem
 * Redis, sem latência extra no caminho quente.
 *
 * Continua valendo a pena porque o abuso que motivou o achado — uma sessão em
 * laço, um clique repetido, uma tela com defeito — chega quase sempre na mesma
 * instância e é barrado. O que ele não barra é ataque distribuído deliberado;
 * para isso o limite precisa de armazenamento compartilhado ou da borda da
 * hospedagem. O teto está declarado aqui para ninguém confundir os dois.
 *
 * O `inFlight` do PDF é diferente e mais forte: mesmo por instância, ele impede
 * o cenário que realmente derruba o processo, que é abrir vários Chrome ao
 * mesmo tempo.
 */

interface HitWindow {
  /** Timestamps dos hits dentro da janela corrente. */
  hits: number[];
}

const windows = new Map<string, HitWindow>();

/** Impede o Map de crescer sem limite com chaves que nunca mais serão vistas. */
const MAX_KEYS = 5_000;

export interface RateLimitConfig {
  /** Máximo de requisições na janela. */
  limit: number;
  /** Tamanho da janela em milissegundos. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Segundos até a vaga mais próxima liberar. Só faz sentido quando `ok` é false. */
  retryAfter: number;
  remaining: number;
}

/**
 * Janela deslizante. `key` deve identificar o autor da chamada e a operação —
 * ex.: `chat:alice@x.com`. Nunca use só a rota: viraria limite global e um
 * usuário derrubaria os outros.
 */
export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitConfig,
  now = Date.now(),
): RateLimitResult {
  const windowStart = now - windowMs;
  const entry = windows.get(key) ?? { hits: [] };

  // Descarta o que saiu da janela antes de decidir.
  const hits = entry.hits.filter((t) => t > windowStart);

  if (hits.length >= limit) {
    const oldest = hits[0] ?? now;
    windows.set(key, { hits });
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
      remaining: 0,
    };
  }

  hits.push(now);
  windows.set(key, { hits });

  if (windows.size > MAX_KEYS) collectGarbage(windowStart);

  return { ok: true, retryAfter: 0, remaining: limit - hits.length };
}

function collectGarbage(windowStart: number): void {
  for (const [k, v] of windows) {
    if (v.hits.every((t) => t <= windowStart)) windows.delete(k);
  }
}

/** Resposta 429 padronizada. `Retry-After` é o que o cliente deve respeitar. */
export function rateLimitResponse(result: RateLimitResult, message: string): Response {
  return Response.json(
    { code: 'RATE_LIMITED', message, retryAfter: result.retryAfter },
    { status: 429, headers: { 'Retry-After': String(result.retryAfter) } },
  );
}

// ─── Limite de concorrência ───────────────────────────────────────────────

const inFlight = new Map<string, number>();

/**
 * Teto de execuções SIMULTÂNEAS. Para o export de PDF isto protege mais que a
 * taxa: dois Chrome ao mesmo tempo é um problema de memória agora, e não uma
 * questão de quantas vezes por minuto.
 *
 * Devolve `null` quando o teto foi atingido; caso contrário devolve a função que
 * libera a vaga — que TEM que ser chamada em `finally`.
 */
export function acquireSlot(bucket: string, max: number): (() => void) | null {
  const current = inFlight.get(bucket) ?? 0;
  if (current >= max) return null;
  inFlight.set(bucket, current + 1);
  let released = false;
  return () => {
    if (released) return; // idempotente: liberar duas vezes zeraria o contador
    released = true;
    const n = (inFlight.get(bucket) ?? 1) - 1;
    if (n <= 0) inFlight.delete(bucket);
    else inFlight.set(bucket, n);
  };
}

/** Only for tests. */
export function __resetRateLimit(): void {
  windows.clear();
  inFlight.clear();
}
