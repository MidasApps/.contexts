/**
 * Cronômetro de fases do `/api/chat`.
 *
 * Existe porque a pergunta "por que o chat demora 20s?" não tinha resposta
 * mensurável: o log dizia só o total da requisição. Sem saber quanto custa cada
 * elo (Firestore, construção dos 8 agentes, supervisor, cada sub-agente,
 * BigQuery), qualquer otimização é chute.
 *
 * Emite UMA linha JSON no fim da requisição — log estruturado, sem PII: só
 * nomes de fase, durações e contagem de delegações. A pergunta do usuário
 * nunca entra.
 */

export interface PhaseTimer {
  /** Mede uma etapa assíncrona e devolve o valor dela intacto. */
  time<T>(name: string, fn: () => Promise<T>): Promise<T>;
  /** Marca um instante (ms desde o início da requisição). */
  mark(name: string): void;
  /** Registra uma delegação a sub-agente, para contagem e duração. */
  delegationStart(toolName: string): void;
  delegationEnd(toolName: string): void;
  /** Emite a linha de log. Idempotente — chamadas seguintes são no-op. */
  finish(extra?: Record<string, unknown>): void;
}

interface Delegation {
  agent: string;
  startedAtMs: number;
  durationMs: number | null;
}

/**
 * @param meta campos fixos da requisição (sessionId, page…) — sem PII.
 * @param now relógio injetável; o default é o do sistema. Injetar mantém o
 *   teste determinístico (rule `testing`: sem `Date.now()` no assert).
 * @param emit destino da linha; default `console.info`.
 */
export function createPhaseTimer(
  meta: Record<string, unknown> = {},
  now: () => number = () => Date.now(),
  emit: (line: string) => void = (line) => console.info(line),
): PhaseTimer {
  const t0 = now();
  const phases: Record<string, number> = {};
  const marks: Record<string, number> = {};
  const delegations: Delegation[] = [];
  let finished = false;

  return {
    async time<T>(name: string, fn: () => Promise<T>): Promise<T> {
      const start = now();
      try {
        return await fn();
      } finally {
        // No `finally` para que uma etapa que lança ainda apareça no log —
        // fase que falhou também consome tempo, e é justamente a que interessa.
        phases[name] = now() - start;
      }
    },

    mark(name: string): void {
      marks[name] = now() - t0;
    },

    delegationStart(toolName: string): void {
      delegations.push({ agent: toolName, startedAtMs: now() - t0, durationMs: null });
    },

    delegationEnd(toolName: string): void {
      // A última em aberto com esse nome: delegações do mesmo agente podem se
      // repetir no turno, e fechar a primeira inflaria a duração dela.
      for (let i = delegations.length - 1; i >= 0; i--) {
        const d = delegations[i]!;
        if (d.agent === toolName && d.durationMs === null) {
          d.durationMs = now() - t0 - d.startedAtMs;
          return;
        }
      }
    },

    finish(extra: Record<string, unknown> = {}): void {
      if (finished) return;
      finished = true;
      emit(
        JSON.stringify({
          event: 'chat_timing',
          ...meta,
          totalMs: now() - t0,
          phases,
          marks,
          delegacoes: delegations.length,
          delegacoesDetalhe: delegations,
          ...extra,
        }),
      );
    },
  };
}
