import 'server-only';

/**
 * Quem usa esta métrica.
 *
 * Métrica é compartilhada: o bloco guarda o `metricId`, não uma cópia da
 * receita. Mudar a métrica muda TODA página que aponta para ela — inclusive as
 * que a pessoa não tem aberta e não vai conferir. Antes de alterar, é preciso
 * saber onde ela aparece; é o que responde se dá para editar no lugar ou se o
 * certo é criar uma variante.
 *
 * A varredura é do cliente inteiro porque é essa a pergunta: "quem quebra se eu
 * mexer aqui". Custa uma leitura por relatório, e só acontece quando alguém
 * pede alteração de métrica.
 */

export interface MetricUsage {
  groupId: string;
  reportId: string;
  reportName: string;
  /** Quantos blocos daquela página apontam para a métrica. */
  blocos: number;
}

/**
 * Conta referências à métrica em qualquer profundidade do documento.
 *
 * Anda a árvore inteira em vez de olhar campos conhecidos: `metricId` está no
 * bloco, `sparklineMetricId` no card de KPI, e o próximo campo de métrica vai
 * nascer em algum lugar que esta função ainda não conhece. A regra é o nome —
 * qualquer chave terminada em `metricId`.
 */
export function countReferences(no: unknown, metricId: string): number {
  if (Array.isArray(no)) {
    return no.reduce<number>((sum, item) => sum + countReferences(item, metricId), 0);
  }
  if (no && typeof no === 'object') {
    let n = 0;
    for (const [key, value] of Object.entries(no)) {
      if (typeof value === 'string') {
        if (key.toLowerCase().endsWith('metricid') && value === metricId) n += 1;
        continue;
      }
      n += countReferences(value, metricId);
    }
    return n;
  }
  return 0;
}

export async function metricUsages(
  db: FirebaseFirestore.Firestore,
  clientId: string,
  metricId: string,
): Promise<MetricUsage[]> {
  const groupsCol = db.collection('clients').doc(clientId).collection('groups');
  const grupos = await groupsCol.get();

  const byGroup = await Promise.all(
    grupos.docs.map(async (g) => {
      const reports = await groupsCol.doc(g.id).collection('reports').get();
      return reports.docs
        .map((r) => {
          const data = r.data() as { name?: unknown; blockMap?: unknown };
          const blocks = countReferences(data.blockMap, metricId);
          if (blocks === 0) return null;
          return {
            groupId: g.id,
            reportId: r.id,
            reportName: typeof data.name === 'string' ? data.name : r.id,
            blocos: blocks,
          };
        })
        .filter((u): u is MetricUsage => u !== null);
    }),
  );

  return byGroup.flat();
}

/** Alguém ALÉM da página aberta usa esta métrica? */
export function usedOutside(
  uses: MetricUsage[],
  target: { groupId?: string; reportId?: string },
): boolean {
  return uses.some((u) => u.groupId !== target.groupId || u.reportId !== target.reportId);
}
