/**
 * Recusa de `metricId` que não existe no catálogo do cliente.
 *
 * Um bloco aponta para a métrica que o alimenta; apontar para uma que não existe
 * produz um bloco que nunca carrega — e o usuário só descobre olhando a página
 * quebrada, depois de a IA ter anunciado sucesso. A tool recusa na hora e devolve
 * candidatos, no mesmo formato de `BLOCK_TYPE_MISMATCH`: erro que o modelo lê,
 * corrige e conta ao usuário.
 *
 * Sem catálogo (contexto semântico ausente) a guarda não opina — mesma escolha
 * das outras: refs de catálogo degradam soft, só resolução de dado é fail-loud.
 */
export type MetricCatalog = ReadonlyArray<string>;

export interface MetricRefusal {
  ok: false;
  error: 'METRIC_NOT_FOUND';
  metricId: string;
  candidatos: string[];
  message: string;
}

/** Métricas do catálogo que compartilham domínio ou pedaço do slug. */
function candidatesFor(catalog: MetricCatalog, metricId: string): string[] {
  const [domain = '', slug = ''] = metricId.toLowerCase().split('.');
  const terms = slug.split(/[_-]+/).filter((t) => t.length > 3);
  return catalog
    .filter((id) => {
      const target = id.toLowerCase();
      if (domain && target.startsWith(`${domain}.`)) return true;
      return terms.some((t) => target.includes(t));
    })
    .slice(0, 8);
}

export function rejectUnknownMetric(
  catalog: MetricCatalog | undefined,
  metricId: string,
): MetricRefusal | null {
  if (!catalog?.length) return null;
  if (catalog.includes(metricId)) return null;

  const candidates = candidatesFor(catalog, metricId);
  return {
    ok: false,
    error: 'METRIC_NOT_FOUND',
    metricId,
    candidatos: candidates,
    message: candidates.length
      ? `A métrica "${metricId}" não existe no catálogo deste cliente. Existem: ${candidates.join(', ')}. `
        + 'Use uma delas ou diga ao usuário que o indicador pedido não está disponível.'
      : `A métrica "${metricId}" não existe no catálogo deste cliente, e não há nada parecido. `
        + 'Diga ao usuário que este indicador não está disponível — não crie o bloco.',
  };
}
