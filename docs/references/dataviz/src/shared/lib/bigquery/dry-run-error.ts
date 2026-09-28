/**
 * Classe de um erro de dry-run do BigQuery, para decidir o que pode chegar a
 * quem escreveu a query (modelo, ou a autoria de métrica).
 *
 * - **Sintaxe** ("Syntax error: …"): o BigQuery acusa ANTES de resolver
 *   nomes. Conferido por dry-run: a mesma query malformada dá a mesma mensagem
 *   e a mesma posição (deslocada só pelo tamanho do texto) apontando para uma
 *   tabela de outro tenant que existe, para uma que não existe e para uma do
 *   cliente. A posição não diz nada sobre objetos — pode voltar.
 * - **Todo o resto** — "Unrecognized name", "Not found", "Access Denied",
 *   "No matching signature", tipo, e o que não se reconhecer — sai de uma
 *   resolução de nome que JÁ olhou os objetos. Mensagem, posição e até a
 *   diferença entre "deu erro" e "compilou" dizem se uma tabela ou coluna de
 *   outro cliente existe e qual o tipo dela. Por isso tudo isso tem uma
 *   resposta só, genérica, e o detalhe fica no log do servidor.
 *
 * Por classe de erro, e não enumerando as posições de tabela da query: a
 * enumeração estática falhou duas vezes (JOIN entre parênteses, hint `@{…}`).
 */
export type DryRunErrorClass =
  | { kind: 'sintaxe'; position: string | null }
  | { kind: 'semantico' };

export function classifyDryRunError(err: unknown): DryRunErrorClass {
  const msg = (err instanceof Error ? err.message : String(err ?? '')).trim();
  if (!/^Syntax error:/.test(msg)) return { kind: 'semantico' };
  return { kind: 'sintaxe', position: msg.match(/\[\d+:\d+\]/)?.[0] ?? null };
}

/** Texto do erro — só para o log do servidor, nunca para o modelo. */
export function errorDetail(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
