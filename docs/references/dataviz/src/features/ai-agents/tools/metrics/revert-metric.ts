import { tool } from 'ai';
import { z } from 'zod';
import { getDb } from '@/shared/lib/firebase/admin';
import { MetricDoc, type MetricShape } from '@/shared/schemas/metric';
import { auditFields } from '@/shared/lib/firestore/audit';
import { nextVersion } from '@/shared/lib/metrics/chat-metric';
import { archiveRevision, latestRevision } from '@/shared/lib/metrics/metric-revisions';
import { blockKeysHint } from './columns-by-shape';
import type { ServerContext } from '../server-context';

/**
 * Desfaz a última alteração de uma métrica.
 *
 * É o que torna a correção compartilhada uma operação aceitável. Corrigir uma
 * métrica melhora todas as páginas que a usam — que é o ponto de o catálogo ser
 * compartilhado — mas propagar sem poder voltar transforma um engano em
 * incidente. Com o desfazer, o custo de errar é uma frase.
 *
 * O próprio desfazer é arquivado antes de acontecer: desfazer o desfazer
 * funciona, e o histórico não perde degrau.
 */
export function createRevertMetricTool(ctx: ServerContext) {
  return tool({
    description:
      'Desfaz a última alteração de uma métrica, restaurando como ela estava antes. '
      + 'Use quando o usuário disser que a mudança piorou, ou quando você mesmo perceber que a '
      + 'alteração anterior estava errada. Só vale para métricas deste cliente.',
    inputSchema: z.object({
      metricId: z.string().describe('Id da métrica a restaurar'),
    }),
    execute: async ({ metricId }) => {
      const { clientId, userEmail } = ctx;
      if (!clientId || !userEmail) {
        return { ok: false as const, error: 'SEM_TENANT' as const, message: 'Nenhum cliente ativo.' };
      }

      const db = getDb();
      const ref = db.collection('metrics').doc(metricId);
      const snap = await ref.get();
      if (!snap.exists) {
        return {
          ok: false as const,
          error: 'METRIC_NOT_FOUND' as const,
          message: `A métrica "${metricId}" não existe.`,
        };
      }
      const current = (snap.data() ?? {}) as Record<string, unknown>;

      if ((current.ownerClientId ?? null) !== clientId) {
        return {
          ok: false as const,
          error: 'METRICA_DE_OUTRO_DONO' as const,
          message:
            'Esta métrica é do catálogo compartilhado, não deste cliente — ela não foi alterada por aqui '
            + 'e não pode ser restaurada por aqui.',
        };
      }

      const revision = await latestRevision(db, metricId);
      if (!revision) {
        return {
          ok: false as const,
          error: 'SEM_HISTORICO' as const,
          message: `A métrica "${metricId}" nunca foi alterada — não há versão anterior para restaurar.`,
        };
      }

      /*
       * Valida o que veio do histórico antes de reescrever. O documento
       * arquivado passou por `MetricDoc` quando foi gravado, mas pode ser
       * antigo — e restaurar sem conferir devolveria ao catálogo um documento
       * que o resto do sistema já não sabe ler.
       */
      const parsed = MetricDoc.safeParse(revision.doc);
      if (!parsed.success) {
        return {
          ok: false as const,
          error: 'REVISAO_INVALIDA' as const,
          message:
            'A versão anterior não é mais válida para o formato atual de métrica e não pode ser restaurada '
            + 'automaticamente. Diga isso ao usuário.',
        };
      }

      const restored = {
        ...parsed.data,
        // Semver segue subindo: o histórico é uma linha, não um vaivém.
        version: nextVersion(current.version),
        ...(typeof revision.doc.createdBy === 'string' ? { createdBy: revision.doc.createdBy } : {}),
        ...auditFields(userEmail, false),
      };

      // O estado atual entra no histórico ANTES de ser substituído — desfazer o
      // desfazer é só chamar de novo.
      await archiveRevision({ db, metricId, doc: current, email: userEmail });
      await ref.set(restored);

      const columns = parsed.data.outputColumns ?? [];
      return {
        action: 'metric_reverted' as const,
        metricId,
        version: restored.version,
        restauradaDaVersao: revision.version,
        shape: parsed.data.shape as MetricShape | undefined,
        outputColumns: columns,
        aviso: [
          'Métrica restaurada como estava antes da última alteração — em todas as páginas que a usam.',
          blockKeysHint(columns),
        ].filter(Boolean).join(' '),
      };
    },
  });
}
