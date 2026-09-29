/**
 * O que o usuário pode escolher no seletor de agente do chat.
 *
 * ─── Por que existe uma lista, e por que ela é curta ───
 *
 * O universo de agentes que o runtime consegue instanciar NÃO é o que está no
 * Firestore: `buildMastraInstance` registra um conjunto fixo de especialistas,
 * e o supervisor é montado à parte (`build-supervisor-agent`). Um agente criado
 * no AI Studio existe como configuração, mas não tem factory — oferecê-lo no
 * seletor prometeria algo que a requisição não entrega.
 *
 * Por isso o catálogo é código, não consulta: ele é o contrato entre o que a
 * tela oferece e o que a rota sabe construir. `AGENT_FACTORIES` (instance.ts) é
 * tipado por `SpecialistId`, então acrescentar um id aqui sem a factory
 * correspondente quebra o build — que é exatamente onde esse erro deve doer.
 *
 * Os nomes são curtos de propósito: no painel de 360px o prefixo "Agente" se
 * repetiria oito vezes sem distinguir nada. As descrições saem da própria
 * instrução de cada agente ("Sua função é responder…").
 */

/** Os especialistas que `buildMastraInstance` registra — nesta ordem na tela. */
export const SPECIALISTS = [
  'descriptive',
  'diagnostic',
  'predictive',
  'prescriptive',
  'monitoring',
  'simulation',
  'external',
  'cashflow',
] as const;

export type SpecialistId = (typeof SPECIALISTS)[number];

/** O supervisor: escolhe o especialista sozinho e é o único com as tools de autoria. */
export const DEFAULT_AGENT_ID = 'orchestrator';

export type ChatAgentId = SpecialistId | typeof DEFAULT_AGENT_ID;

export interface ChatAgentOption {
  id: ChatAgentId;
  name: string;
  description: string;
  /** Termos que a busca também considera — sinônimos que o usuário digitaria. */
  searchTerms: string;
}

export const CHAT_AGENTS: ChatAgentOption[] = [
  {
    id: DEFAULT_AGENT_ID,
    name: 'Assistente geral',
    description: 'Escolhe o especialista sozinho e monta páginas do relatório com você.',
    searchTerms: 'supervisor orquestrador geral padrão criar página editar bloco',
  },
  {
    id: 'descriptive',
    name: 'Descritivo',
    description: 'O que aconteceu? Números, KPIs, safras e recortes da carteira.',
    searchTerms: 'kpi indicador média mediana percentil vintage segmentação',
  },
  {
    id: 'diagnostic',
    name: 'Diagnóstico',
    description: 'Por que aconteceu? Causas, correlações e concentração.',
    searchTerms: 'causa correlação hhi concentração decomposição hipótese',
  },
  {
    id: 'predictive',
    name: 'Preditivo',
    description: 'O que vem pela frente? Projeções, PD/LGD e curvas de sobrevivência.',
    searchTerms: 'previsão forecast tendência arima pd lgd cpr cdr early warning',
  },
  {
    id: 'prescriptive',
    name: 'Prescritivo',
    description: 'O que fazer? Priorização de ações, repasse e impacto esperado.',
    searchTerms: 'recomendação ação cobrança repasse ranking roi cluster',
  },
  {
    id: 'monitoring',
    name: 'Monitoramento',
    description: 'Algo está fora do lugar? Alertas, covenants, elegibilidade e CVM 60.',
    searchTerms: 'alerta compliance covenant anomalia elegibilidade regulatório',
  },
  {
    id: 'simulation',
    name: 'Simulação',
    description: 'E se…? Cenários, stress, sensibilidade e VaR.',
    searchTerms: 'cenário stress sensibilidade var cvar ecl choque',
  },
  {
    id: 'external',
    name: 'Macroeconomia',
    description: 'O que acontece no mercado? Selic, IPCA, câmbio, notícias e benchmarks.',
    searchTerms: 'externo macro selic ipca cdi igpm câmbio bacen notícia benchmark',
  },
  {
    id: 'cashflow',
    name: 'Fluxo de caixa',
    description: 'Como estão os fluxos? WAL, excess spread, cobertura e haircut.',
    searchTerms: 'caixa wal spread cobertura oc ic haircut recebível',
  },
];

/**
 * Normaliza o que veio do cliente (localStorage antigo, body de requisição) —
 * id desconhecido cai no supervisor em vez de derrubar a conversa.
 */
export function resolveChatAgentId(value: string | null | undefined): ChatAgentId {
  if (!value) return DEFAULT_AGENT_ID;
  const match = CHAT_AGENTS.find((a) => a.id === value);
  return match ? match.id : DEFAULT_AGENT_ID;
}

/** A opção correspondente ao id, sempre — desconhecido devolve o supervisor. */
export function findChatAgent(id: string | null | undefined): ChatAgentOption {
  const target = resolveChatAgentId(id);
  return CHAT_AGENTS.find((a) => a.id === target) ?? CHAT_AGENTS[0]!;
}

/** Sem acento e em minúsculas: ninguém digita "simulação" na caixa de busca. */
function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Busca por nome, descrição ou sinônimo. Termo vazio devolve tudo. */
export function filterAgents(term: string): ChatAgentOption[] {
  const t = foldText(term).trim();
  if (!t) return CHAT_AGENTS;
  return CHAT_AGENTS.filter((a) => foldText(`${a.name} ${a.description} ${a.searchTerms}`).includes(t));
}
