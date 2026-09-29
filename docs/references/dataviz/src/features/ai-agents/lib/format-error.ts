import { BYTES_CAP_TOOL_MESSAGE, isBytesBilledError } from '@/shared/lib/bigquery/cost-guard';
import { knownProjectIds } from '@/shared/lib/bigquery/known-project-ids';

const MAX_ERROR_CHARS = 2000;
const REDACTED = '[project]';
const REDACTED_SA = '[service-account]';

/**
 * Forma de um id de projeto GCP: 6 a 30 caracteres, minúsculas, dígitos e
 * hífen, começa com letra e não termina em hífen. Região (`us-central1`,
 * `region-us`) tem a mesma forma e não é projeto.
 */
const NOT_A_REGION = String.raw`(?!region-|(?:us|europe|asia|southamerica|northamerica|australia|me|africa)-[a-z]+\d*\b)`;
/**
 * Nome de permissão IAM (`bigquery.jobs.create`, `resourcemanager.projects.get`)
 * tem a forma de `projeto.dataset.tabela`; o prefixo é o serviço, não projeto.
 */
const NOT_A_SERVICE_PREFIX = String.raw`(?!(?:bigquery|bigquerystorage|bigquerydatatransfer|resourcemanager|storage|serviceusage|aiplatform|cloudkms|logging|monitoring|datastore|firestore|pubsub|iam|compute|run|cloudfunctions|dataform|dataplex|datacatalog|orgpolicy)\.)`;
const PROJECT_ID = String.raw`${NOT_A_REGION}${NOT_A_SERVICE_PREFIX}[a-z][a-z0-9-]{4,28}[a-z0-9]`;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Onde um id aparece numa mensagem do BigQuery/GCP — só na POSIÇÃO de projeto.
 * A versão anterior apagava todo token com hífen e dígito ou com dois hífens,
 * e levava junto região, modelo e palavra comum (`us-central1`,
 * `gemini-2.0-flash`, `utf-8`, `out-of-range`), enquanto deixava passar id
 * sem hífen (`acmeprod:ds`). Id solto no texto, fora destas posições, só é
 * pego se for CONHECIDO (`knownProjectIds`) ou tiver o formato que o GCP gera.
 *
 * Nome de dataset, tabela e coluna fica: é o que o modelo precisa para
 * corrigir a própria query.
 */
/**
 * E-mail de service account — inteiro: o nome da conta também não é dado do
 * modelo. Roda ANTES da replacement dos ids conhecidos: trocado o projeto primeiro,
 * `conta@[project].iam…` já não casa, e o nome da conta ficava.
 */
const SERVICE_ACCOUNT = new RegExp(
  String.raw`[\w.+-]+@(?:${PROJECT_ID}\.iam|appspot|developer)\.gserviceaccount\.com\b`,
  'g',
);

const PROJECT_PATTERNS: Array<[RegExp, string]> = [
  // Com domínio: `example.com:my-project`.
  [new RegExp(String.raw`\b[a-z0-9-]+(?:\.[a-z0-9-]+)+:${PROJECT_ID}\b`, 'g'), REDACTED],
  // `projeto:dataset` (forma legada do BigQuery), também entre crases/aspas.
  [new RegExp(String.raw`\b${PROJECT_ID}(?=[\`"']?:[A-Za-z_])`, 'g'), REDACTED],
  // `projeto.dataset.tabela` (três partes), também entre crases/aspas.
  [new RegExp(String.raw`\b${PROJECT_ID}(?=[\`"']?\.[A-Za-z_]\w*\.[A-Za-z_*])`, 'g'), REDACTED],
  // Id com hífen antes de `.dataset`: dataset não tem hífen, então é projeto.
  [new RegExp(String.raw`\b${NOT_A_REGION}[a-z][a-z0-9]*(?:-[a-z0-9]+)+(?=[\`"']?\.[A-Za-z_])`, 'g'), REDACTED],
  // Formatos que o GCP gera, soltos: `white-smile-508914-q2`, `gen-lang-client-0123456789`.
  [/\b[a-z]+-[a-z]+-\d{6}(?:-[a-z0-9]{1,4})?\b/g, REDACTED],
  [/\bgen-lang-client-\d{6,}\b/g, REDACTED],
];

/**
 * Palavras comuns depois de "project" — "Project settings", "the project
 * billing account". Com a mesma forma de um id sem hífen, eram trocadas. A
 * palavra termina onde não segue letra, dígito NEM hífen: `billing-prod-42` é
 * id, não "billing".
 */
const NOT_A_WORD_AFTER_PROJECT = String.raw`(?!(?:settings?|default|billing|number|members?|owners?|level|creation|deletion|polic(?:y|ies)|access|resources?|metadata|configuration|location|region|quotas?|cannot|should|which|where|does|must|might|contains|requires|already|exists|named|using|scope|limits?|labels?|folder|organization|permissions?)(?![\w-]))`;

/** Depois de "project", "projects/", "project ID", "projectId" ou "project_id". */
const AFTER_PROJECT_WORD = new RegExp(
  String.raw`((?<![\w-])[Pp]roject(?:s|_?[Ii][Dd]|Id|\s+ID)?["']?[\s/:="'\`]*)${NOT_A_WORD_AFTER_PROJECT}${PROJECT_ID}`,
  'g',
);

const redactProjectIds = (text: string): string => {
  let out = text.replace(SERVICE_ACCOUNT, REDACTED_SA);
  for (const id of knownProjectIds()) {
    out = out.replace(new RegExp(String.raw`(?<![\w-])${escapeRegExp(id)}(?![\w-])`, 'g'), REDACTED);
  }
  for (const [re, replacement] of PROJECT_PATTERNS) out = out.replace(re, replacement);
  return out.replace(AFTER_PROJECT_WORD, `$1${REDACTED}`);
};

/**
 * Formats a tool error for LLM consumption.
 * - Truncates long error messages with head/tail preview
 * - Strips BigQuery internal metadata (job IDs, project ids in every GCP shape)
 * - Turns the byte-cap refusal into an actionable instruction: every chat tool
 *   runs its query with `maximumBytesBilled`, and they all report errors here.
 */
export const formatToolError = (err: unknown): string => {
  if (isBytesBilledError(err)) return BYTES_CAP_TOOL_MESSAGE;
  const raw = err instanceof Error ? err.message : String(err);

  const cleaned = redactProjectIds(raw.replace(/\bJob\s+[a-zA-Z0-9_:.-]+/g, '[job]')).trim();

  if (cleaned.length <= MAX_ERROR_CHARS) return cleaned;

  const half = Math.floor(MAX_ERROR_CHARS / 2);
  return `${cleaned.slice(0, half)}\n\n... [${cleaned.length - MAX_ERROR_CHARS} caracteres omitidos] ...\n\n${cleaned.slice(-half)}`;
};
