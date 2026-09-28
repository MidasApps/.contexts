import { guardGeneratedSql } from '@/features/ai-agents/lib/sql-guard';

/**
 * Descarta o SQL que a guarda recusaria hoje, antes de ele chegar ao modelo
 * como exemplo — do recall semântico e do catálogo curado.
 *
 * O exemplo recuperado vai ao modelo como modelo a seguir. SQL gravado antes
 * de uma regra nova — consulta a `INFORMATION_SCHEMA` com o id do projeto por
 * extenso, por exemplo — vazaria o que a regra esconde e ensinaria um padrão
 * que `execute_sql` recusa. O catálogo curado tem o mesmo problema: as linhas
 * aprovadas antes eram validadas SEM escopo. Filtrar na leitura vale para o
 * que já está gravado, sem apagar nada.
 */
export const withoutRefusedSql = <T>(items: readonly T[], getSql: (item: T) => string): T[] =>
  items.filter((item) => guardGeneratedSql(getSql(item)).ok);
