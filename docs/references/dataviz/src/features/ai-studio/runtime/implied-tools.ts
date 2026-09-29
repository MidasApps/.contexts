/**
 * Tools que vêm junto com outra, independente do que a config do agente lista.
 *
 * Quem roda SQL (`execute_sql`, `dry_run_sql`) precisa de `get_table_schema`:
 * a guarda recusa `INFORMATION_SCHEMA` e a recusa manda usar
 * `get_table_schema` para ver colunas, e o erro de nome/tipo na tabela do
 * próprio cliente não diz mais qual coluna falhou (ver `tenant-query.ts`). Sem
 * a tool, o agente fica sem jeito de descobrir o schema. Seis dos oito agentes
 * não a tinham na config gravada (`aiAgents.toolRefs`); somá-la aqui vale para
 * a config do Firestore e para o fallback, sem migração de dado.
 */
const SQL_TOOLS: ReadonlyArray<string> = ['execute_sql', 'dry_run_sql'];

export const withImpliedTools = (keys: readonly string[]): string[] => {
  const runsSql = keys.some((key) => SQL_TOOLS.includes(key));
  return runsSql && !keys.includes('get_table_schema') ? [...keys, 'get_table_schema'] : [...keys];
};
