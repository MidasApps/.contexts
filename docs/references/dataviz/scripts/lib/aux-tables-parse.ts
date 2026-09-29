// scripts/lib/aux-tables-parse.ts — parsing puro das bases auxiliares
// (BA - Bancos / BA - Pluggy Transactions ID) exportadas do Google Sheets
// como CSV. Sem I/O: recebe o objeto de linha já parseado pelo csv-parse
// (`columns: true`) e devolve o shape alvo das tabelas `liquid_aux.*`.
//
// Tokens observados nos CSVs para "sem valor": célula vazia, `n/a`
// (BA - Bancos, coluna Número_Código) e `NaN` / `null` (BA - Pluggy,
// export de uma API que serializa ausência de parent como essas strings).
// Todos viram `null` — inclusive nos campos numéricos, onde `Number('')`
// resultaria em `0` (falso zero) se não fossem filtrados antes do parse.
const NULL_TOKENS = new Set(['', 'n/a', 'nan', 'null']);

function isNullToken(raw: string | undefined | null): boolean {
  if (raw == null) return true;
  return NULL_TOKENS.has(raw.trim().toLowerCase());
}

export function parseStringOrNull(raw: string | undefined | null): string | null {
  if (isNullToken(raw)) return null;
  return raw!.trim();
}

/** Número em formato BR (`.` milhar, `,` decimal) ou token nulo → null. */
export function parseNumberBr(raw: string | undefined | null): number | null {
  if (isNullToken(raw)) return null;
  const normalized = raw!.trim().replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Data `dd/mm/aaaa` → ISO `aaaa-mm-dd`; token nulo ou formato inesperado → null. */
export function parseDateBr(raw: string | undefined | null): string | null {
  if (isNullToken(raw)) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw!.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export interface BankRow {
  ispb: string | null;
  nome_reduzido: string | null;
  numero_codigo: number | null;
  participa_compe: string | null;
  acesso_principal: string | null;
  nome_extenso: string | null;
  inicio_operacao: string | null;
}

/** Mapeia uma linha do CSV "BA - Bancos" (colunas do export COMPE). */
export function mapBankRow(row: Record<string, string>): BankRow {
  return {
    ispb: parseStringOrNull(row['ISPB']),
    nome_reduzido: parseStringOrNull(row['Nome_Reduzido']),
    numero_codigo: parseNumberBr(row['Número_Código']),
    participa_compe: parseStringOrNull(row['Participa_da_Compe']),
    acesso_principal: parseStringOrNull(row['Acesso_Principal']),
    nome_extenso: parseStringOrNull(row['Nome_Extenso']),
    inicio_operacao: parseDateBr(row['Início_da_Operação']),
  };
}

export interface PluggyCategoryRow {
  idx: number | null;
  id: number | null;
  description: string | null;
  description_translated: string | null;
  parent_id: number | null;
  parent_description: string | null;
  parent_description_translated: string | null;
}

/**
 * Mapeia uma linha do CSV "BA - Pluggy - Transactions ID". As últimas
 * ~7 linhas do export não têm `index`/`id` (categorias custom da Liquid,
 * sem correspondente na taxonomia Pluggy) — são preservadas normalmente,
 * apenas com `idx`/`id` nulos.
 */
export function mapPluggyCategoryRow(row: Record<string, string>): PluggyCategoryRow {
  return {
    idx: parseNumberBr(row['index']),
    id: parseNumberBr(row['id']),
    description: parseStringOrNull(row['description']),
    description_translated: parseStringOrNull(row['descriptionTranslated']),
    parent_id: parseNumberBr(row['parentId']),
    parent_description: parseStringOrNull(row['parentDescription']),
    parent_description_translated: parseStringOrNull(row['parentDescriptionTranslated']),
  };
}
