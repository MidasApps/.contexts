/**
 * Slug a partir de texto livre — fonte única.
 *
 * Havia OITO cópias disto no projeto, e elas não concordavam: quatro
 * (`AiAgentsTab`, `AiSkillsTab`, `AiWorkflowsTab`, `KnowledgeBasesTab`)
 * chamavam `normalize('NFD')` sem remover os acentos separados. O `NFD` quebra
 * `ç` em `c` + cedilha combinante; sem tirar a cedilha, ela cai no
 * `[^a-z0-9]` e vira hífen. Resultado em produto brasileiro, onde quase todo
 * nome tem acento:
 *
 *     "Evolução de Obra"      → evoluc-a-o-de-obra
 *     "Situação de Certidões" → situac-a-o-de-certido-es
 *
 * Isso não é cosmético quando o slug vira id de documento e, portanto, URL.
 */

/** Teto de tamanho. `FirestoreDocId` aceita 120; 60 deixa folga para sufixo. */
const MAX_SLUG = 60;

/**
 * Converte texto livre em slug kebab-case, sem acento.
 *
 * Devolve string VAZIA quando não sobra nenhum caractere aproveitável (nome só
 * com emoji ou pontuação). Quem usa o resultado como id decide o fallback —
 * ver `uniqueSlug`.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    // Remove os diacríticos que o NFD acabou de separar. É esta linha que
    // faltava nas quatro cópias divergentes.
    //
    // A faixa vai por ESCAPE (\u0300-\u036f), não pelos caracteres literais.
    //
    // As duas formas se comportam igual — isto é legibilidade, não correção.
    // Escrita com as marcas cruas, a faixa fica INVISÍVEL no editor: o
    // colchete parece vazio, e qualquer ferramenta que reescreva o arquivo
    // pode comê-la sem deixar rastro no diff. Editar esta linha custou três
    // tentativas justamente por isso.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    // O corte pode deixar hífen na ponta ("plano-empresario-" ao cortar).
    .replace(/-+$/g, '');
}

/**
 * Slug único dentro de um conjunto já ocupado.
 *
 * Colisão ganha sufixo numérico (`fluxo-de-caixa`, `fluxo-de-caixa-2`, …) em
 * vez de sobrescrever — no Firestore, `.doc(id).set()` sobre id existente
 * SUBSTITUI o documento, então colidir aqui apagaria a página do outro.
 *
 * @param text  nome digitado pelo usuário
 * @param taken  ids que já existem no mesmo escopo
 * @param fallback  usado quando o nome não produz slug algum (só emoji, só
 *                  pontuação) — precisa ser um slug válido
 */
export function uniqueSlug(
  text: string,
  taken: Iterable<string>,
  fallback = 'pagina',
): string {
  const base = slugify(text) || fallback;
  const used = new Set(taken);
  if (!used.has(base)) return base;

  // Começa em 2: "fluxo-de-caixa" e "fluxo-de-caixa-2" lê melhor que "-1".
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  // Mil homônimos é cenário de script em loop, não de uso humano. Um sufixo
  // aleatório mantém a escrita possível em vez de derrubar a requisição.
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}
