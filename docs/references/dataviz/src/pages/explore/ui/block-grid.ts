import { GRID_COLUMNS } from '@/features/report-authoring/schema/block-specs';

/**
 * A grade onde os blocos do relatório se encaixam — uma só, para as duas telas.
 *
 * Edição e leitura desenhavam grades DIFERENTES da mesma página. A edição
 * (`CanvasPanel`) põe todos os blocos numa grade contínua e deixa o CSS
 * encaixá-los na ordem; a leitura (`ReportPage`) abria uma grade por linha
 * gravada em `layout`, transformando cada linha num corte rígido. Enquanto toda
 * linha somava 6 as duas coincidiam. Bastou o usuário estreitar um bloco para
 * abrirem: na edição o vizinho subia para o espaço livre, na leitura ficava um
 * vão — a mesma página com dois desenhos, e o segundo aparecendo só depois de
 * salvar.
 *
 * O encaixe por ordem não é escolha desta tela: é o modelo que o `canvas-store`
 * aplica (`fitsInRow`), que o `turn-log` relata ao assistente e que o
 * prompt do supervisor descreve ("o próximo bloco de até N entra nessa mesma
 * linha; acima disso, abre a próxima"). A leitura era o único lugar que lia
 * `layout` como quebra obrigatória. Agora `layout` é ORDEM, e só.
 */

/**
 * ⚠️ `grid-cols-6` é literal porque o Tailwind varre classes estáticas — não dá
 * para interpolar `GRID_COLUMNS`. Quem garante que os dois números seguem
 * iguais é o teste deste módulo, não o compilador.
 */
export const GRID_CLASS = 'grid grid-cols-6 gap-4';

/**
 * Quantas colunas este bloco ocupa na grade.
 *
 * Sem normalizar contra o contrato de propósito: bloco gravado fora da faixa
 * (template antigo, importação) renderiza como está gravado nas DUAS telas.
 * Corrigir largura é decisão de quem edita — ver a régua no `BlockRail` —,
 * não efeito colateral de abrir a página.
 */
export function widthStyle(columns: number): { gridColumn: string } {
  const clampToGrid = Math.min(Math.max(Math.round(columns) || 1, 1), GRID_COLUMNS);
  return { gridColumn: `span ${clampToGrid}` };
}
