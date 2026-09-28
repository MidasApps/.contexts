import type { EvalRunAggregateRow } from '@app/api/admin/eval-runs/route';

/**
 * Opções e linhas do filtro por versão do judge.
 *
 * O filtro ia ao servidor (`judgeModelVersion`), e as opções eram tiradas da
 * resposta JÁ filtrada: escolhida uma versão, as outras sumiam da lista até
 * voltar em "Todos". Agora a página busca a janela inteira uma vez e filtra
 * aqui; as opções saem sempre do conjunto completo (e das versões com drift),
 * e trocar o filtro não refaz a busca.
 */
export const filterByJudgeVersion = (args: Readonly<{
  rows: readonly EvalRunAggregateRow[];
  driftVersions: readonly string[];
  selected: string;
}>): { options: string[]; visibleRows: EvalRunAggregateRow[] } => {
  const versions = [
    ...args.rows.map((row) => row.judgeModelVersion),
    ...args.driftVersions,
    args.selected,
  ].filter(Boolean);
  return {
    options: [...new Set(versions)].sort(),
    visibleRows: args.selected
      ? args.rows.filter((row) => row.judgeModelVersion === args.selected)
      : [...args.rows],
  };
};
