/**
 * Teto duro de bytes faturados por query no BigQuery.
 *
 * Fonte ÚNICA — não copie o número. Este repo já pagou o preço de helper
 * duplicado duas vezes (`getToken()` em 3 arquivos, que produziu o 401 do
 * export de PDF; e 8 cópias locais de `verifyAuth`).
 *
 * Por que teto duro e não só aprovação: a aprovação (hoje, a do BQML —
 * `approvalBytesThreshold` abaixo) faz dry-run e PEDE confirmação — é gate de
 * UX. `maximumBytesBilled` é gate de cobrança: o BigQuery rejeita o job com
 * `bytesBilledLimitExceeded` antes de faturar. Os dois coexistem de propósito.
 *
 * O caminho que mais precisa disso é o SQL gerado por LLM: o filtro de
 * palavra-chave impede DML/DDL, não impede varrer a tabela inteira.
 *
 * Default de 5 GiB (≈ US$ 0,03 em BigQuery on-demand; precedente registrado
 * em rules/cost.md). Ajustável por BQ_MAX_BYTES_BILLED.
 */
const DEFAULT_MAX_BYTES_BILLED = 5 * 1024 ** 3;

export function maxBytesBilled(): number {
  const raw = Number(process.env.BQ_MAX_BYTES_BILLED);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_BYTES_BILLED;
}

/**
 * Limiar de APROVAÇÃO de bytes (hoje, do treino BQML): acima dele o usuário
 * confirma antes do job.
 *
 * Fica SEMPRE abaixo do teto. Com os dois em 5 GiB, todo job grande o bastante
 * para pedir aprovação era recusado pelo teto depois de aprovado: a aprovação
 * não aprovava nada. A alternativa — subir o teto do job aprovado — foi
 * descartada: o teto é o que limita o prejuízo máximo (rules/cost.md), e uma
 * aprovação (dada pelo modelo, num runtime que não chame `needsApproval`, ou por
 * um clique distraído) não pode fazê-lo desaparecer.
 *
 * O default é derivado do teto, não um número novo: metade dele. A faixa entre
 * os dois é onde a aprovação tem sentido — o job custa o bastante para
 * perguntar e ainda cabe no teto. Metade deixa essa faixa tão larga quanto a
 * faixa sem pergunta, e acompanha o teto quando `BQ_MAX_BYTES_BILLED` muda.
 * `BQML_APPROVAL_BYTES_THRESHOLD` ajusta; valor inválido ou que não fique
 * abaixo do teto cai no default (falha para o lado de perguntar MAIS).
 */
export function approvalBytesThreshold(): number {
  const cap = maxBytesBilled();
  const raw = Number(process.env.BQML_APPROVAL_BYTES_THRESHOLD);
  const configured = process.env.BQML_APPROVAL_BYTES_THRESHOLD?.trim() ? raw : NaN;
  return Number.isFinite(configured) && configured > 0 && configured < cap ? configured : cap / 2;
}

/**
 * Mensagem de erro para quando o BigQuery recusa por exceder o teto.
 * Reconhecível por `bytesBilledLimitExceeded` no erro do job.
 */
export function isBytesBilledError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return msg.includes('bytesBilledLimitExceeded')
    || msg.includes('maximum bytes billed')
    // O texto que o job de fato devolve; o `reason` fica em `errors[]`, fora da mensagem.
    || /exceeded limit for bytes billed/i.test(msg);
}

/**
 * O que o MODELO lê quando o teto recusa o job: o que mudar, não o erro cru
 * (rules/cost.md — erro ininteligível gera repetição, e repetição gera custo).
 */
export const BYTES_CAP_TOOL_MESSAGE =
  'A query excede o teto de bytes faturáveis e foi rejeitada antes de executar. '
  + 'Estreite o escopo: filtre por data_base_report e projeto na WHERE, '
  + 'selecione só as colunas necessárias e evite SELECT *.';
