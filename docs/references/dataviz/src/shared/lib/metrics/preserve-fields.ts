/**
 * O que sobrevive quando alguém reescreve um documento de métrica INTEIRO.
 *
 * Dois caminhos gravam métrica reconstruindo o documento do zero, sem merge: a
 * tela de administração (`POST /api/metrics`, `set(..., { merge: false })`) e o
 * chat (`chat-metric.ts`). Nos dois, tudo que o escritor não sabe expressar
 * some — e para a maior parte dos campos isso é o comportamento certo: quem
 * edita é a nova verdade, e campo esvaziado de propósito precisa continuar
 * esvaziável.
 *
 * Os dois campos abaixo são a exceção porque NENHUM dos dois escritores os
 * expressa. Perdê-los não é decisão de ninguém — é dano:
 *
 * - `filterFields` (ADR-0026): declara o que o filtro de página compara nesta
 *   métrica. Só seed/admin de catálogo escreve. Sem preservar, editar a métrica
 *   pelo chat ou pela tela de admin apagava a declaração e o seletor da página
 *   parava de recortar aquele bloco em silêncio.
 * - `derivedFrom`: a linhagem carimbada quando a métrica nasceu como variação
 *   de outra.
 *
 * Por que um módulo e não duas linhas em cada lugar: a lista é propriedade do
 * `MetricDoc`, não de quem grava. A rota admin já tinha o padrão certo para
 * `origin`/`derivedFrom` e o chat não tinha nenhum; quando `filterFields`
 * nasceu, ninguém estendeu nem um nem outro — foi exatamente a duplicação que
 * produziu o defeito, duas vezes. Com o módulo, o próximo campo dessa natureza
 * é uma linha em um arquivo, e o import não amarra a rota ao módulo do chat.
 *
 * O que NÃO mora aqui é o que difere entre os dois: `origin` é preservado só
 * pela rota admin (o formulário não o expressa), enquanto no chat a recipe
 * passou MESMO a ser escrita pelo chat e o campo deve mudar. Cada chamador
 * acrescenta o seu.
 *
 * Quem chama junta o resultado ao payload ANTES de validar com `MetricDoc`:
 * preservar é gravar, e o que se grava valida. Declaração malformada faz a
 * escrita inteira falhar, com o motivo, em vez de sumir por uma segunda porta.
 */
export function preservedFromPrevious(
  previous: Record<string, unknown> | null | undefined,
): { filterFields?: unknown; derivedFrom?: string } {
  if (!previous) return {};
  const declaration = previous.filterFields;
  return {
    /*
     * `null`/ausente não é declaração quebrada, é declaração inexistente: não
     * há o que preservar, e travar a edição por causa disso (o schema recusa
     * `null` num campo `.optional()`) seria inventar um bloqueio.
     */
    ...(declaration !== null && typeof declaration === 'object' ? { filterFields: declaration } : {}),
    ...(typeof previous.derivedFrom === 'string' ? { derivedFrom: previous.derivedFrom } : {}),
  };
}
