# Sprint 1.D — Dynamic Instructions, Unified lookup_glossary, Persona/Client Profiles, Macro Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Injetar contexto dinâmico de cliente, persona, ICP, glossário e macro snapshot (BCB SGS) nos agentes do Dashboard Builder e do orchestrator analítico, extraindo `lookup_glossary` para arquivo único, expandindo o glossário de ~20 para ~50 termos, e centralizando perfis JSON.

**Architecture:** Sem RAG ainda (Sprint 2). Apenas: (1) tool `lookup_glossary` única em `src/features/ai-agents/tools/lookup-glossary.ts`, (2) `src/shared/config/business-context/` com perfis estáticos JSON (clientes OM/BRZ/CONX/IMCASA × 12 personas + ICPs), (3) `useMacroSnapshot` hook + tool `get_macro_snapshot` lendo BCB SGS séries 432/188/433/189/226 com cache 1h, (4) `buildAgentSystem` recebe `(clientId, personaId, icpId)` e compõe system prompt com perfis + macro + glossário curto.

**Tech Stack:** Vitest (assume Sprint 1.A), Zod 4, AI SDK v6, Vertex Gemini via `@ai-sdk/google-vertex`. Sem dependência nova.

---

## Pré-requisitos

- Sprint 1.A entregue: Vitest configurado em `vitest.config.ts`, scripts `test` e `test:run` em `package.json`, `@testing-library/react` disponível para hooks.
- Plano-fonte de referência: `docs/superpowers/plans/2026-05-04-business-context-personas-evals.md` (§2 camadas, §5 glossário, §7 Fase 1).
- Documentos de benchmarking lidos por humanos (não são input estruturado): `docs/benchmarking/6.1` (personas) e `docs/benchmarking/6.2` (ICPs). Tarefas com perfis JSON listam quais campos extrair via `Read` tool.

## Convenções

- Todo arquivo novo recebe header de contexto curto se exportar API pública. Sem comentários redundantes.
- Imports relativos não. Use `@/...`.
- Testes ficam ao lado do arquivo (`x.ts` + `x.test.ts`) salvo quando o arquivo é JSON puro (nesse caso o teste mora no loader).
- Cada Task termina em um único commit; mensagem prefixada com `feat(sprint1.D):` ou `refactor(sprint1.D):` ou `test(sprint1.D):`.
- TDD obrigatório: o passo de teste vem antes do passo de implementação na lista. Rodar `pnpm test:run -- <arquivo>` após cada step de implementação.

---

## Task 1 — Glossário expandido (~50 termos) com estrutura

**Files:**
- Modify: `src/shared/config/glossary.ts`
- Create: `src/shared/config/glossary.test.ts`

**Steps:**

- [ ] **Read** `src/shared/config/glossary.ts` atual e listar termos existentes (esperado ~20). Anotar quais já têm definição rica vs. apenas string.
- [ ] **Test (RED):** criar `src/shared/config/glossary.test.ts` com:
  - `it('exports GLOSSARY_VERSION as ISO date string')` — checa `/^\d{4}-\d{2}-\d{2}$/`.
  - `it('contains required core terms')` — array com 50 chaves obrigatórias: `['ltv','dscr','wal','pdd','oc','es','cri','cra','lci','mcmv','sbpe','cvm_60','cmn_2682','distratos','incc','ipca','sinapi','icvm_175','rating_liquid','pdd_minimo_bacen','pro_soluto','safra','curva_inadimplencia','vintage','fpr','spe','patrimonio_separado','agente_fiduciario','cota_senior','cota_subordinada','curva_recebimento','vgv','tabela_price','sac','carencia','amortizacao','custo_obra','medicao','repasse','habite_se','registro_imobiliario','alienacao_fiduciaria','hipoteca','due_diligence','rating','spread','duration','convexidade','taxa_efetiva','pti','dti']` — todos devem existir como key (lowercase, snake_case).
  - `it('every entry has definition string non-empty')`.
  - `it('formula entries have well-formed strings when present')` (smoke).
  - `it('getGlossaryDefinition returns string for known term and empty for unknown')`.
  - `it('getGlossaryEntry returns full structured object')`.
- [ ] Rodar `pnpm test:run -- src/shared/config/glossary.test.ts` → RED.
- [ ] **Implement (GREEN):** refatorar `glossary.ts` para:
  ```ts
  export const GLOSSARY_VERSION = '2026-05-04';
  export interface GlossaryEntry {
    definition: string;
    formula?: string;
    benchmark?: string;
    regulamento?: string[];
    sourceDoc?: string;
  }
  export const GLOSSARY: Record<string, GlossaryEntry> = { ... };
  export function getGlossaryEntry(term: string): GlossaryEntry | undefined;
  export function getGlossaryDefinition(term: string): string;
  export function listGlossaryTerms(): string[];
  ```
  - `getGlossaryEntry` faz lookup case-insensitive normalizando `term.toLowerCase().replaceAll(/[\s-]+/g,'_')`.
  - `getGlossaryDefinition` retorna `entry?.definition ?? ''` para manter compat string.
  - Manter os termos antigos exportados.
- [ ] Adicionar entradas para os ≥30 novos termos. Para cada termo, ao menos `definition`. Para `cri, cra, lci, cvm_60, cmn_2682, icvm_175, fpr, alienacao_fiduciaria, agente_fiduciario, patrimonio_separado` incluir `regulamento: [...]`. Para `ltv, dscr, wal, pti, dti, oc, es, vgv, duration, convexidade, taxa_efetiva, tabela_price, sac, pdd_minimo_bacen` incluir `formula`. `sourceDoc` com nomes plausíveis em `docs/benchmarking/` quando aplicável (ex.: `'docs/benchmarking/6.3-conceitos-credito.md'`).
- [ ] Garantir importações antigas continuam compilando: rodar `pnpm tsc --noEmit` ou `pnpm build` (parcial OK se tipo não quebrar).
- [ ] Rodar `pnpm test:run -- src/shared/config/glossary.test.ts` → GREEN.
- [ ] **Commit:** `feat(sprint1.D): expand glossary to 50 structured entries with version and helpers`.

---

## Task 2 — Tool unificada `lookup_glossary`

**Files:**
- Create: `src/features/ai-agents/tools/lookup-glossary.ts`
- Create: `src/features/ai-agents/tools/lookup-glossary.test.ts`

**Steps:**

- [ ] **Test (RED):** em `lookup-glossary.test.ts`:
  - `it('returns structured entry for known term')` — passa `{ term: 'LTV' }` e espera `{ term:'ltv', found:true, definition:..., formula:..., glossaryVersion:'2026-05-04' }` (o resto opcional).
  - `it('returns suggestions for unknown term')` — passa `{ term: 'ltvz' }` espera `{ found:false, suggestions: ['ltv', ...] }` com 3 itens, ordenados por Levenshtein.
  - `it('exports tool name lookup_glossary')`.
  - `it('inputSchema requires term as non-empty string')`.
  - Mockar nada — testa contra glossário real.
- [ ] Rodar test → RED.
- [ ] **Implement:**
  ```ts
  import { tool } from 'ai';
  import { z } from 'zod';
  import { getGlossaryEntry, listGlossaryTerms, GLOSSARY_VERSION } from '@/shared/config/glossary';

  function normalize(t: string) { return t.toLowerCase().replaceAll(/[\s-]+/g,'_'); }
  function levenshtein(a: string, b: string): number { /* DP simples */ }
  function suggest(term: string): string[] {
    const t = normalize(term);
    return listGlossaryTerms()
      .map(k => ({ k, d: levenshtein(t, k) }))
      .sort((a,b)=>a.d-b.d).slice(0,3).map(x=>x.k);
  }

  export const LOOKUP_GLOSSARY_TOOL_NAME = 'lookup_glossary' as const;
  export const lookupGlossaryTool = tool({
    description: 'Consulta o glossário oficial do dashboard...',
    inputSchema: z.object({ term: z.string().min(1) }),
    execute: async ({ term }) => {
      const key = normalize(term);
      const entry = getGlossaryEntry(key);
      if (!entry) return { term: key, found: false, suggestions: suggest(term), glossaryVersion: GLOSSARY_VERSION };
      return { term: key, found: true, glossaryVersion: GLOSSARY_VERSION, ...entry };
    },
  });
  ```
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `feat(sprint1.D): extract lookup_glossary into single shared tool`.

---

## Task 3 — Remover duplicações inline em agents/sub-agent

**Files:**
- Modify: `src/features/ai-agents/agents/descriptive-agent.ts`
- Modify: `src/features/canvas-orchestrator/lib/sub-agent.ts`
- Create: `src/features/ai-agents/agents/descriptive-agent.test.ts` (smoke, se ainda não existir)

**Steps:**

- [ ] **Read** `descriptive-agent.ts:60-90` e `sub-agent.ts:200-240` para mapear definição inline atual (chave do tool, schema, execute).
- [ ] **Test (RED):** smoke em `descriptive-agent.test.ts`:
  - `it('uses shared lookupGlossaryTool reference for lookup_glossary')` — importa o agent factory, monta tools record (ou descreve via API pública), checa `tools.lookup_glossary === lookupGlossaryTool` (referência identidade).
  - Idêntico para `sub-agent.ts` (smoke pode coabitar em arquivo `sub-agent.test.ts`).
- [ ] Rodar tests → RED (porque ainda inline).
- [ ] **Implement:** remover bloco inline em ambos arquivos, adicionar:
  ```ts
  import { lookupGlossaryTool, LOOKUP_GLOSSARY_TOOL_NAME } from '@/features/ai-agents/tools/lookup-glossary';
  ...
  tools: {
    [LOOKUP_GLOSSARY_TOOL_NAME]: lookupGlossaryTool,
    // ...demais tools
  }
  ```
- [ ] Rodar `grep -rn "name: ['\"]lookup_glossary['\"]" src/` — esperado: zero ocorrências (apenas import/uso).
- [ ] Rodar tests → GREEN.
- [ ] **Commit:** `refactor(sprint1.D): replace inline lookup_glossary with shared tool import`.

---

## Task 4 — Schemas Zod para perfis estáticos

**Files:**
- Create: `src/shared/config/business-context/schemas.ts`
- Create: `src/shared/config/business-context/schemas.test.ts`

**Steps:**

- [ ] **Test (RED):**
  - `it('ClientProfileSchema rejects unknown id')` — `id: 'XYZ'` falha; `'OM'` passa.
  - `it('ClientProfileSchema requires portfolio.dominantProduct and schemaHints')`.
  - `it('PersonaProfileSchema validates layer enum')` — só `estrategica|tatica|operacional`.
  - `it('PersonaProfileSchema validates language and horizon enums')`.
  - `it('IcpProfileSchema requires segment and primaryKpis non-empty')`.
- [ ] **Implement:**
  ```ts
  import { z } from 'zod';
  export const CLIENT_IDS = ['OM','BRZ','CONX','IMCASA'] as const;
  export const ClientIdSchema = z.enum(CLIENT_IDS);
  export const ClientProfileSchema = z.object({
    id: ClientIdSchema,
    portfolio: z.object({
      dominantProduct: z.string(),
      avgLtv: z.number().optional(),
      wal: z.number().optional(),
      ocTarget: z.number().optional(),
    }),
    schemaHints: z.object({
      tablesPreferred: z.array(z.string()).min(1),
      partitionKey: z.string(),
      granularity: z.enum(['contrato','safra','carteira']),
    }),
    internalGlossaryOverrides: z.array(z.object({
      term: z.string(),
      definition: z.string(),
      sourceTable: z.string().optional(),
    })).default([]),
    complianceConstraints: z.array(z.string()).default([]),
  });
  export const PersonaProfileSchema = z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string(),
    layer: z.enum(['estrategica','tatica','operacional']),
    language: z.enum(['tecnica','executiva','operacional']),
    horizon: z.enum(['curto','medio','longo']),
    priorityKpis: z.array(z.string()).min(1),
    preferredGranularity: z.enum(['contrato','safra','carteira']),
    preferredVisuals: z.array(z.string()).default([]),
    jargonAnchor: z.array(z.string()).default([]),
    forbidden: z.array(z.string()).default([]),
  });
  export const IcpProfileSchema = z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    segment: z.string(),
    examples: z.array(z.string()).default([]),
    primaryKpis: z.array(z.string()).min(1),
    decisionJourney: z.string(),
  });
  export type ClientProfile = z.infer<typeof ClientProfileSchema>;
  export type PersonaProfile = z.infer<typeof PersonaProfileSchema>;
  export type IcpProfile = z.infer<typeof IcpProfileSchema>;
  ```
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `feat(sprint1.D): add Zod schemas for client/persona/icp profiles`.

---

## Task 5 — Perfis JSON dos 4 clientes

**Files:**
- Create: `src/shared/config/business-context/clients/om.json`
- Create: `src/shared/config/business-context/clients/brz.json`
- Create: `src/shared/config/business-context/clients/conx.json`
- Create: `src/shared/config/business-context/clients/imcasa.json`
- Create: `src/shared/config/business-context/clients/clients-loader.test.ts`

**Steps:**

- [ ] **Read** `src/shared/stores/app-store.ts` para confirmar que os 4 IDs batem (OM, BRZ, CONX, IMCASA).
- [ ] **Read (opcional)** `docs/benchmarking/` em busca de menções aos clientes para campos `portfolio` e `complianceConstraints` realistas.
- [ ] **Test (RED):** `clients-loader.test.ts`:
  - `it('loads all 4 clients and validates against ClientProfileSchema')` — itera `['OM','BRZ','CONX','IMCASA']`, importa o JSON correspondente, parse via schema, espera sucesso.
  - `it('client.id matches filename id')`.
- [ ] **Implement:** preencher cada JSON com dados defensivos, ex. para `om.json`:
  ```json
  {
    "id": "OM",
    "portfolio": {
      "dominantProduct": "CRI pulverizado de incorporação MCMV",
      "avgLtv": 0.72,
      "wal": 4.2,
      "ocTarget": 0.15
    },
    "schemaHints": {
      "tablesPreferred": ["om_contratos","om_recebiveis","om_safras"],
      "partitionKey": "data_emissao",
      "granularity": "contrato"
    },
    "internalGlossaryOverrides": [
      { "term": "safra", "definition": "Conjunto de contratos emitidos no mesmo trimestre civil.", "sourceTable": "om_safras" }
    ],
    "complianceConstraints": [
      "CVM 60",
      "CMN 2682",
      "ICVM 175"
    ]
  }
  ```
  - Análogos para BRZ (foco shopping/comercial), CONX (residencial pré-pago), IMCASA (MCMV grande). TODO comments dentro do JSON não são possíveis; em vez disso o loader emite `console.warn` se faltar `_meta.refinedBySme: true` (campo opcional não-Zod).
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `feat(sprint1.D): add static profiles for OM, BRZ, CONX, IMCASA clients`.

---

## Task 6 — Perfis JSON das 12 personas

**Files:**
- Create: `src/shared/config/business-context/personas/ceo-incorporadora.json`
- Create: `src/shared/config/business-context/personas/cfo-securitizadora.json`
- Create: `src/shared/config/business-context/personas/diretor-fii-cri.json`
- Create: `src/shared/config/business-context/personas/diretor-credito-banco.json`
- Create: `src/shared/config/business-context/personas/gestor-credito-obra.json`
- Create: `src/shared/config/business-context/personas/gestor-repasse.json`
- Create: `src/shared/config/business-context/personas/controller.json`
- Create: `src/shared/config/business-context/personas/gestor-carteira-securitizadora.json`
- Create: `src/shared/config/business-context/personas/analista-credito.json`
- Create: `src/shared/config/business-context/personas/analista-cobranca.json`
- Create: `src/shared/config/business-context/personas/corretor.json`
- Create: `src/shared/config/business-context/personas/backoffice-cartorario.json`
- Create: `src/shared/config/business-context/personas/personas-loader.test.ts`

**Steps:**

- [ ] **Read** `docs/benchmarking/6.1` (ou arquivo equivalente em `docs/benchmarking/`) com `Read` tool. Identificar para cada persona: `priorityKpis` (3-6 KPIs do dia-a-dia), `language` style, `horizon`, `preferredGranularity`, `preferredVisuals`, `jargonAnchor`, `forbidden` (jargão a evitar).
  - Se arquivo não existir exatamente nesse path, `grep -r 'persona' docs/benchmarking/` e mapear; degradar para defaults razoáveis se ausente, marcando `_meta.refinedBySme: false`.
- [ ] **Test (RED):** `personas-loader.test.ts`:
  - `it('loads all 12 personas and validates each')` — array literal com 12 ids; importa cada JSON; valida.
  - `it('all persona ids are unique and slugified')`.
  - `it('layer distribution matches: estrategica≥3, tatica≥4, operacional≥3')`.
- [ ] **Implement:** preencher 12 JSONs. Mapeamento de camada:
  - **Estratégica:** ceo-incorporadora, cfo-securitizadora, diretor-fii-cri, diretor-credito-banco.
  - **Tática:** gestor-credito-obra, gestor-repasse, controller, gestor-carteira-securitizadora.
  - **Operacional:** analista-credito, analista-cobranca, corretor, backoffice-cartorario.
  - Exemplo `cfo-securitizadora.json`:
    ```json
    {
      "id": "cfo-securitizadora",
      "name": "CFO de Securitizadora",
      "layer": "estrategica",
      "language": "executiva",
      "horizon": "longo",
      "priorityKpis": ["oc","es","wal","rating","pdd","duration"],
      "preferredGranularity": "carteira",
      "preferredVisuals": ["kpi","line","stack-bar"],
      "jargonAnchor": ["overcollateralization","subordinação","tranche","patrimônio separado"],
      "forbidden": ["LTV", "obra"]
    }
    ```
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `feat(sprint1.D): add 12 persona profiles spanning estrategica/tatica/operacional`.

---

## Task 7 — Perfis JSON dos ICPs (subset prioritário)

**Files:**
- Create: `src/shared/config/business-context/icps/incorporadora-mcmv-grande.json`
- Create: `src/shared/config/business-context/icps/incorporadora-map.json`
- Create: `src/shared/config/business-context/icps/fundo-cri-listado.json`
- Create: `src/shared/config/business-context/icps/securitizadora.json`
- Create: `src/shared/config/business-context/icps/banco-grande.json`
- Create: `src/shared/config/business-context/icps/fintech-credito.json`
- Create: `src/shared/config/business-context/icps/icps-loader.test.ts`

**Steps:**

- [ ] **Read** `docs/benchmarking/6.2` se existir; senão usar defaults conservadores.
- [ ] **Test (RED):** `icps-loader.test.ts`:
  - `it('loads all 6 ICPs and validates against IcpProfileSchema')`.
  - `it('all icp ids unique')`.
- [ ] **Implement:** ex. `fundo-cri-listado.json`:
  ```json
  {
    "id": "fundo-cri-listado",
    "segment": "Fundo de Investimento Imobiliário (CRI) listado em B3",
    "examples": ["KNCR11","HGCR11","RBRR11"],
    "primaryKpis": ["dy","p_vp","duration","spread","rating","pdd"],
    "decisionJourney": "Comitê mensal — análise de carteira, alocação por rating, monitoramento de inadimplência."
  }
  ```
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `feat(sprint1.D): add 6 priority ICP profiles`.

---

## Task 8 — Loader unificado `loadBusinessContext`

**Files:**
- Create: `src/shared/config/business-context/index.ts`
- Create: `src/shared/config/business-context/index.test.ts`

**Steps:**

- [ ] **Test (RED):**
  - `it('returns client+persona+icp for valid ids')`.
  - `it('throws BusinessContextError with code UNKNOWN_CLIENT for invalid clientId')`.
  - `it('throws UNKNOWN_PERSONA for invalid personaId')`.
  - `it('throws UNKNOWN_ICP for invalid icpId')`.
  - `it('icpId is optional and returns icp:null')`.
  - `it('exports KNOWN_CLIENTS, KNOWN_PERSONAS, KNOWN_ICPS arrays')`.
- [ ] **Implement:**
  ```ts
  import omJson from './clients/om.json';
  // ...demais imports estáticos
  import { ClientProfileSchema, PersonaProfileSchema, IcpProfileSchema, type ClientProfile, type PersonaProfile, type IcpProfile } from './schemas';

  const CLIENTS: Record<string, ClientProfile> = {
    OM: ClientProfileSchema.parse(omJson),
    BRZ: ClientProfileSchema.parse(brzJson),
    CONX: ClientProfileSchema.parse(conxJson),
    IMCASA: ClientProfileSchema.parse(imcasaJson),
  };
  const PERSONAS: Record<string, PersonaProfile> = { ... };
  const ICPS: Record<string, IcpProfile> = { ... };

  export const KNOWN_CLIENTS = Object.keys(CLIENTS);
  export const KNOWN_PERSONAS = Object.keys(PERSONAS);
  export const KNOWN_ICPS = Object.keys(ICPS);

  export class BusinessContextError extends Error {
    constructor(public code: 'UNKNOWN_CLIENT'|'UNKNOWN_PERSONA'|'UNKNOWN_ICP', msg: string) { super(msg); }
  }

  export interface BusinessContext {
    client: ClientProfile;
    persona: PersonaProfile;
    icp: IcpProfile | null;
  }

  export function loadBusinessContext(args: { clientId: string; personaId: string; icpId?: string | null }): BusinessContext {
    const client = CLIENTS[args.clientId];
    if (!client) throw new BusinessContextError('UNKNOWN_CLIENT', `clientId=${args.clientId}`);
    const persona = PERSONAS[args.personaId];
    if (!persona) throw new BusinessContextError('UNKNOWN_PERSONA', `personaId=${args.personaId}`);
    let icp: IcpProfile | null = null;
    if (args.icpId) {
      icp = ICPS[args.icpId] ?? null;
      if (!icp) throw new BusinessContextError('UNKNOWN_ICP', `icpId=${args.icpId}`);
    }
    return { client, persona, icp };
  }
  ```
  - `tsconfig.json` precisa `"resolveJsonModule": true` (verificar; provavelmente já está em Next.js).
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `feat(sprint1.D): add loadBusinessContext loader and registries`.

---

## Task 9 — BCB SGS fetcher + macro snapshot

**Files:**
- Create: `src/shared/lib/macro/bcb-sgs.ts`
- Create: `src/shared/lib/macro/bcb-sgs.test.ts`
- Create: `src/shared/config/business-context/macro-fallback.json`

**Steps:**

- [ ] **Test (RED):**
  - `it('fetchSgsSeries hits correct URL pattern')` — mock global `fetch`, valida URL `https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/12?formato=json`.
  - `it('parses BCB JSON shape')` — fetch mock retorna `[{data:'01/04/2026', valor:'13.75'}]`; espera `[{data:'2026-04-01', valor:13.75}]` (ISO + number).
  - `it('throws on HTTP error')`.
  - `it('getMacroSnapshot composes 5 series with asOfDate and source=BCB_SGS')`.
  - `it('caches snapshot for 1 hour')` — chama 2x, verifica fetch chamado uma só vez.
  - `it('falls back to macro-fallback.json when fetch throws and MACRO_LIVE=false')` — process.env override + fetch reject.
  - `it('respects MACRO_LIVE=false flag without trying network')`.
- [ ] **Implement:**
  ```ts
  const SERIES = { selic: 432, ipca12m: 433, incc12m: 188, igpm12m: 189, tr12m: 226 } as const;
  const TTL_MS = 60 * 60 * 1000;
  let cached: { at: number; data: MacroSnapshot } | null = null;

  export async function fetchSgsSeries(id: number, ultimos = 12) {
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${id}/dados/ultimos/${ultimos}?formato=json`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`SGS ${id} HTTP ${r.status}`);
    const raw = await r.json() as Array<{data:string;valor:string}>;
    return raw.map(x => ({ data: toIso(x.data), valor: Number(x.valor) }));
  }

  export interface MacroSnapshot {
    asOfDate: string;
    source: 'BCB_SGS' | 'fallback';
    series: Record<keyof typeof SERIES, { last: number; series: Array<{data:string;valor:number}> }>;
  }

  export async function getMacroSnapshot(): Promise<MacroSnapshot> {
    if (cached && Date.now() - cached.at < TTL_MS) return cached.data;
    const live = process.env.MACRO_LIVE !== 'false';
    if (live) {
      try {
        const entries = await Promise.all(Object.entries(SERIES).map(async ([k,id]) => {
          const series = await fetchSgsSeries(id);
          return [k, { last: series.at(-1)!.valor, series }] as const;
        }));
        const data: MacroSnapshot = {
          asOfDate: new Date().toISOString().slice(0,10),
          source: 'BCB_SGS',
          series: Object.fromEntries(entries) as MacroSnapshot['series'],
        };
        cached = { at: Date.now(), data };
        return data;
      } catch (e) { /* fall through */ }
    }
    const fallback = (await import('@/shared/config/business-context/macro-fallback.json')).default as MacroSnapshot;
    cached = { at: Date.now(), data: fallback };
    return fallback;
  }
  ```
- [ ] Criar `macro-fallback.json` com snapshot manual atual (Selic ~14.75, IPCA ~4.5, etc.) e `source:'fallback'`, `asOfDate:'2026-05-01'`.
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `feat(sprint1.D): add BCB SGS macro snapshot fetcher with cache and fallback`.

---

## Task 10 — Tool `get_macro_snapshot`

**Files:**
- Create: `src/features/ai-agents/tools/get-macro-snapshot.ts`
- Create: `src/features/ai-agents/tools/get-macro-snapshot.test.ts`
- Modify: `src/features/ai-agents/agents/descriptive-agent.ts` (registrar tool)
- Modify: `src/features/canvas-orchestrator/lib/sub-agent.ts` (registrar tool)

**Steps:**

- [ ] **Test (RED):**
  - `it('tool name is get_macro_snapshot')`.
  - `it('execute returns MacroSnapshot from getMacroSnapshot')` — mock `getMacroSnapshot`.
  - `it('inputSchema is empty object')`.
  - `it('canvas sub-agent registers get_macro_snapshot in tools')` (smoke por identidade).
- [ ] **Implement tool:**
  ```ts
  import { tool } from 'ai';
  import { z } from 'zod';
  import { getMacroSnapshot } from '@/shared/lib/macro/bcb-sgs';
  export const GET_MACRO_SNAPSHOT_TOOL_NAME = 'get_macro_snapshot' as const;
  export const getMacroSnapshotTool = tool({
    description: 'Retorna snapshot macro (Selic, IPCA, INCC-M, IGP-M, TR) do BCB SGS com cache 1h.',
    inputSchema: z.object({}),
    execute: async () => getMacroSnapshot(),
  });
  ```
- [ ] Registrar em ambos agents (analítico + canvas sub-agent).
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `feat(sprint1.D): add get_macro_snapshot tool and register in agents`.

---

## Task 11 — `buildAgentSystem`: composição dinâmica de system prompt

**Files:**
- Create: `src/shared/config/agents/build-system.ts`
- Create: `src/shared/config/agents/build-system.test.ts`

**Steps:**

- [ ] **Test (RED):**
  - `it('returns string with header containing clientId, personaId, icpId')`.
  - `it('contains client portfolio block')`.
  - `it('contains persona language and forbidden block')`.
  - `it('contains icp block when icp present')`.
  - `it('omits icp block when icp null')`.
  - `it('appends macro snapshot section')`.
  - `it('includes top-10 glossary terms relevant to persona')` — mocka persona com `priorityKpis: ['ltv','dscr',...]` e checa que cada termo aparece no output.
  - `it('appends baseInstructions at the end')`.
  - `it('drops icp details when estimated tokens > 8000')` — usa baseInstructions gigante.
  - `it('drops macro details (keeps single-line summary) when > 12000')`.
  - `it('keeps stable blocks first for prompt cache')` — verifica ordem: cliente→persona→icp→macro→glossário→baseInstructions.
- [ ] **Implement:**
  ```ts
  import { type BusinessContext } from '@/shared/config/business-context';
  import { type MacroSnapshot } from '@/shared/lib/macro/bcb-sgs';
  import { getGlossaryEntry, GLOSSARY_VERSION } from '@/shared/config/glossary';

  export interface BuildAgentSystemArgs {
    context: BusinessContext;
    macro: MacroSnapshot;
    baseInstructions: string;
  }
  const TOK = (s: string) => Math.ceil(s.length / 4);

  export function buildAgentSystem({ context, macro, baseInstructions }: BuildAgentSystemArgs): string {
    const { client, persona, icp } = context;
    const header = `# Contexto dinâmico\nclient=${client.id} persona=${persona.id} icp=${icp?.id ?? 'none'} glossary=${GLOSSARY_VERSION}\n`;
    const clientBlock = renderClient(client);
    const personaBlock = renderPersona(persona);
    let icpBlock = icp ? renderIcp(icp) : '';
    let macroBlock = renderMacro(macro);
    const glossary = renderGlossary(persona.priorityKpis.slice(0,10));

    let composed = [header, clientBlock, personaBlock, icpBlock, macroBlock, glossary, baseInstructions].join('\n\n');
    if (TOK(composed) > 8000 && icp) {
      icpBlock = `## ICP: ${icp.id} (resumido)\n- segmento: ${icp.segment}`;
      composed = [header, clientBlock, personaBlock, icpBlock, macroBlock, glossary, baseInstructions].join('\n\n');
    }
    if (TOK(composed) > 12000) {
      macroBlock = `## Macro (${macro.asOfDate}, ${macro.source})\nSelic ${macro.series.selic.last}% | IPCA12m ${macro.series.ipca12m.last}% | INCC ${macro.series.incc12m.last}% | IGP-M ${macro.series.igpm12m.last}% | TR ${macro.series.tr12m.last}%`;
      composed = [header, clientBlock, personaBlock, icpBlock, macroBlock, glossary, baseInstructions].join('\n\n');
    }
    return composed;
  }
  ```
  - Funções `renderClient`/`renderPersona`/`renderIcp`/`renderMacro`/`renderGlossary` montam markdown legível.
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `feat(sprint1.D): add buildAgentSystem dynamic prompt composer with token guardrails`.

---

## Task 12 — Migrar prompts existentes para `buildAgentSystem`

**Files:**
- Modify: `src/shared/config/agents/canvas-orchestrator.ts`
- Modify: `src/shared/config/agents/orchestrator.ts` (ou caminho equivalente; localizar via grep `buildOrchestratorPrompt`)
- Create: `src/shared/config/agents/canvas-orchestrator.test.ts`
- Create: `src/shared/config/agents/orchestrator.test.ts`

**Steps:**

- [ ] **Search:** `grep -rn 'buildOrchestratorPrompt\|buildCanvasOrchestratorPrompt' src/` para confirmar paths.
- [ ] **Test (RED):**
  - `it('buildCanvasOrchestratorPrompt prepends dynamic system when ids provided')` — passa `clientId/personaId`, verifica saída contém `client=` e o texto base.
  - `it('falls back to base prompt when ids missing')` — sem ids, comportamento anterior preservado.
  - Mesmo para `buildOrchestratorPrompt`.
- [ ] **Implement:** assinatura nova:
  ```ts
  export function buildCanvasOrchestratorPrompt(args: {
    clientId?: string;
    personaId?: string;
    icpId?: string | null;
    /* args antigos preservados */
  }): string;
  ```
  - Internamente, se `clientId && personaId`, chama `loadBusinessContext` + `getMacroSnapshot()` (await — torna função async; ajustar callers).
  - Como `getMacroSnapshot` é async, refatorar prompt builder para `Promise<string>` ou snapshot pode ser injetado externamente. Decisão: builder vira async e callers fazem `await`.
- [ ] Atualizar callers internos (sem mexer ainda em route handlers — Task 14).
- [ ] Rodar tests → GREEN.
- [ ] **Commit:** `feat(sprint1.D): wire buildAgentSystem into canvas and analytical orchestrator prompts`.

---

## Task 13 — Frontend: persona/ICP no app-store

**Files:**
- Modify: `src/shared/stores/app-store.ts`
- Create: `src/shared/stores/app-store.test.ts` (apenas a parte nova; manter outros testes se já existirem)

**Steps:**

- [ ] **Read** estado atual de `app-store.ts` para entender onde fica `activeClient`, persistência (`persist` do Zustand), schema interno.
- [ ] **Test (RED):**
  - `it('default currentPersonaId is cfo-securitizadora')` (escolha defensiva — pode mudar).
  - `it('default currentIcpId is null')`.
  - `it('setCurrentPersona updates state and persists')`.
  - `it('setCurrentIcp accepts null')`.
- [ ] **Implement:** adicionar campos e setters; default persona escolhida; persist key inclui novos campos.
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `feat(sprint1.D): add currentPersonaId and currentIcpId to app-store`.

---

## Task 14 — Routes propagam IDs para orchestrators

**Files:**
- Modify: `app/api/canvas-chat/route.ts`
- Modify: `app/api/chat/route.ts`
- Modify: `src/features/canvas-orchestrator/index.ts` (ou `createCanvasOrchestrator`)
- Modify: `src/features/ai-agents/index.ts` (ou `createOrchestrator`)
- Create: `app/api/canvas-chat/route.test.ts` (smoke)
- Create: `app/api/chat/route.test.ts` (smoke)

**Steps:**

- [ ] **Search:** localizar `createCanvasOrchestrator` e `createOrchestrator` (ou nomes equivalentes).
- [ ] **Test (RED):**
  - `it('canvas-chat route passes personaId/icpId from body to orchestrator')` — mock orchestrator factory, valida args.
  - `it('chat route idem')`.
  - `it('returns 400 when personaId is unknown')` — captura `BusinessContextError`.
- [ ] **Implement:**
  - Estender Zod input schema do route com `personaId: z.string().optional()`, `icpId: z.string().nullable().optional()`.
  - Encaminhar para factories.
  - Factories repassam para `buildCanvasOrchestratorPrompt`/`buildOrchestratorPrompt`.
  - Tratar `BusinessContextError` → `Response.json({error}, {status:400})`.
- [ ] Frontend: ajustar chamadas em `useCanvasChat` (e equivalente) para incluir `personaId` e `icpId` do app-store no body.
- [ ] Rodar tests → GREEN.
- [ ] Smoke manual: `pnpm dev`, abrir Canvas, mudar persona, fazer pergunta, conferir que prompt do log de servidor contém o bloco da persona escolhida.
- [ ] **Commit:** `feat(sprint1.D): propagate personaId and icpId from frontend through routes to orchestrators`.

---

## Task 15 — Acceptance E2E manual

**Files:**
- Create: `docs/superpowers/plans/2026-05-04-sprint1-D-acceptance.md`

**Steps:**

- [ ] **Read** este plano e o de `business-context-personas-evals.md` para listar critérios.
- [ ] **Write** roteiro markdown com:
  1. Pré-condições (env, MACRO_LIVE flag).
  2. Roteiro 1 — trocar persona: como CFO, perguntar "como está a inadimplência?"; como analista de cobrança, mesma pergunta; comparar tom + jargão.
  3. Roteiro 2 — macro snapshot: pedir "considere a Selic atual"; verificar resposta cita valor recente.
  4. Roteiro 3 — glossário: pedir definição de termo novo (`fpr`, `patrimonio_separado`); deve usar tool `lookup_glossary` retornando `glossaryVersion='2026-05-04'`.
  5. Roteiro 4 — fallback: setar `MACRO_LIVE=false`, repetir; conferir `source:'fallback'`.
  6. Roteiro 5 — ICP: alternar ICP `fundo-cri-listado` vs `incorporadora-mcmv-grande`; checar foco da resposta.
  7. Checklist final de Acceptance Criteria (copiar abaixo).
- [ ] Validar manualmente; anotar evidências (screenshots, log snippets) no próprio doc.
- [ ] **Commit:** `docs(sprint1.D): add acceptance roteiro for dynamic instructions`.

---

## Acceptance Criteria

- ✅ `pnpm test:run` verde.
- ✅ Cobertura ≥80% em `src/shared/config/business-context/` e `src/features/ai-agents/tools/lookup-glossary.ts` (verificar via `pnpm test:run -- --coverage`).
- ✅ Glossário com ≥50 termos validados pelo teste.
- ✅ `lookup_glossary` é arquivo único; `grep -rn "name: ['\"]lookup_glossary['\"]" src/` retorna zero matches além do tool central.
- ✅ Trocar persona no store muda demonstravelmente o system prompt (comprovado em `acceptance.md` Roteiro 1).
- ✅ `get_macro_snapshot` retorna dados frescos do BCB SGS em chamada real e fallback testado offline.
- ✅ `pnpm build` sem warnings novos relativos a este sprint.
- ✅ Sem duplicação inline de `lookup_glossary` em `descriptive-agent.ts` ou `sub-agent.ts`.

## Riscos e rollback

- **BCB SGS fora do ar** → fallback `macro-fallback.json`; flag `MACRO_LIVE=false` força modo offline.
- **Persona/ICP IDs inconsistentes entre frontend e config files** → schema Zod no backend rejeita ID inválido; lista mestra `KNOWN_PERSONAS`, `KNOWN_ICPS`, `KNOWN_CLIENTS` exportada em `business-context/index.ts` para o frontend importar e renderizar selects.
- **System prompt cresce demais** → guardrails de tokens em `buildAgentSystem` (Task 11) com fallback drop por relevância (ICP primeiro, macro depois).
- **12 perfis JSON podem ser superficiais inicialmente** → marcado como Fase 2 refinar via SME; campo `_meta.refinedBySme` (false default) sinaliza pendência; loader emite `console.warn` em dev.
- **Refactor da Task 3 quebra agents existentes** → smoke tests por identidade de referência detectam imediatamente; rollback é reverter o commit isolado.
- **`buildAgentSystem` async força callers a virar async** → contido em Task 12; Task 14 cobre routes; testes de Task 12 capturam regressão.

## Time de execução

- Task 1-2 (glossário): general-purpose com TDD.
- Task 3 (refactor): general-purpose com cuidado para não quebrar testes existentes.
- Task 4-8 (perfis e loader): general-purpose, possivelmente acionando agente `credit-risk-analyst` (se disponível) para revisar perfis.
- Task 9-10 (macro): general-purpose, com mock de fetch para teste.
- Task 11-12 (system prompt): general-purpose.
- Task 13-15 (frontend + acceptance): general-purpose.

## Notas para o executor

- Cada Task tem **um único commit** ao final. Se a Task ficar grande, é sinal de que precisa virar duas Tasks — pare e reavalie.
- TDD: o passo de teste (`Test (RED)`) é obrigatório antes do `Implement`. Se o teste já passar antes da implementação, ele está fraco — reforce.
- `pnpm test:run -- <pattern>` é o comando padrão por arquivo; `pnpm test:run` roda tudo.
- Sempre rode `pnpm tsc --noEmit` antes do commit final de cada Task que mexa em tipos públicos (1, 2, 4, 8, 11, 12, 13, 14).
- JSON files não recebem comentários; use `_meta` campo opcional (não validado pelo Zod, ignorado por `passthrough` ou strip default — confirmar comportamento e ajustar schemas com `.passthrough()` se quiser preservar).
- Para perfis defensivos (Tasks 5, 6, 7), prefira valores conservadores e marque `_meta.refinedBySme: false`. Sprint 2 entrega refinamento via SMEs.
