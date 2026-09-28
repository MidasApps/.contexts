# Explore: Skeleton-Driven Layout com Sub-agentes Paralelos

**Data:** 2026-04-02
**Escopo:** Página `/explore` — canvas orchestrator e rendering

## Problema

Hoje o canvas orchestrator do `/explore` constrói blocos sequencialmente: `plan_analysis` → `query_data` → `add_*_block` → `query_data` → `add_*_block`... Os blocos só aparecem no canvas quando cada `add_*_block` completa. O usuário não sabe o que vai aparecer até que apareça, e o tempo total é a soma de todas as etapas.

## Solução

Mudar para um modelo "skeleton-first": o orchestrator primeiro declara o layout completo (quais blocos, tipos, posições), o canvas renderiza skeletons tipados imediatamente, e depois sub-agentes preenchem cada bloco em paralelo. O plano é adaptável — o orchestrator pode adicionar/remover blocos conforme os resultados chegam.

## Fluxo Novo

```
User pergunta
  → orchestrator chama declare_layout({ blocks: [...] })
  → canvas renderiza skeletons tipados com labels
  → orchestrator chama fill_block × N em paralelo (mesmo step)
    → cada fill_block delega para sub-agente especializado
    → sub-agente executa tools (SQL, cálculos)
    → retorna dados estruturados via submit_*_data tool
    → fill_block converte em CanvasBlock
  → canvas substitui cada skeleton pelo bloco real conforme completa
  → orchestrator analisa resultados, pode add_slot/remove_slot
```

## Componentes

### 1. Tool `declare_layout`

Chamada pelo orchestrator como primeiro passo. Declara todos os blocos planejados.

**Input:**
```typescript
{
  pageTitle: string;
  pageDescription?: string;
  blocks: Array<{
    slotId: string;           // ID estável para referência
    type: 'kpi' | 'chart' | 'table' | 'text';
    label: string;            // Exibido no skeleton
    colSpan?: 1 | 2 | 3;     // Default por tipo (kpi=1, chart=2, table=3, text=2)
  }>;
  filters?: {
    dateRange?: { start: string; end: string };
    projetos?: string[];
  };
}
```

**Output (ecoa input completo para o client):**
```typescript
{
  action: 'declare_layout',
  pageIndex: number,
  pageTitle: string,
  pageDescription?: string,
  blocks: Array<{ slotId: string; type: string; label: string; colSpan?: number }>,
  filters?: { dateRange?: { start: string; end: string }; projetos?: string[] }
}
```

**Efeito no canvas store:**
1. Chama `createPage(pageTitle, pageDescription)`
2. Para cada bloco, chama `addBlock` com um `SkeletonBlock`

**Localização:** `src/features/canvas-orchestrator/tools/declare-layout.ts`

### 2. Novo tipo `SkeletonBlock` (types.ts)

Para acomodar blocos placeholder sem dados, introduzimos um novo tipo na union `CanvasBlock`:

```typescript
export interface SkeletonBlock extends BaseBlock {
  type: 'skeleton';
  targetType: 'kpi' | 'chart' | 'table' | 'text';  // Qual tipo de skeleton renderizar
  slotLabel: string;                                  // Label exibido no skeleton
  slotStatus: 'pending' | 'loading' | 'error';
  slotError?: string;
}

export type CanvasBlock = TextBlock | KpiBlock | SingleKpiBlock | ChartBlock | TableBlock | SkeletonBlock;
```

**Por que um tipo separado ao invés de campos opcionais no BaseBlock:**
- Placeholders não satisfazem os campos obrigatórios dos block types concretos (ex: `ChartBlock` requer `chartType`, `data`, `dataKeys`, `xAxisKey`)
- Um tipo explícito `SkeletonBlock` garante type-safety — o compiler força o tratamento correto
- Quando `fill_block` preenche o slot, ele **substitui** o `SkeletonBlock` por um block concreto (SingleKpiBlock, ChartBlock, etc.) via `replaceBlock` no store

**Retrocompatibilidade:** Blocos existentes sem `type: 'skeleton'` continuam funcionando normalmente. Conversas salvas no Firestore não são afetadas.

### 3. Mudança no canvas-store: `replaceBlock`

Novo método no Zustand store para substituir um SkeletonBlock por um bloco concreto:

```typescript
replaceBlock(pageIndex: number, slotId: string, block: CanvasBlock): void
```

**Implementação simplificada:** O `replaceBlock` apenas substitui a entrada em `blockMap[slotId]` pelo novo bloco. O novo bloco usa o mesmo `id` (= `slotId`), então o array `layout[].blockIds` não precisa de nenhuma alteração — as referências continuam válidas. Isso é possível porque `declare_layout` usa o `slotId` como `id` do `SkeletonBlock`.

```typescript
replaceBlock: (pageIndex, slotId, block) => set((state) => {
  const page = state.pages[pageIndex];
  if (!page || !page.blockMap[slotId]) return state;
  const newPages = [...state.pages];
  newPages[pageIndex] = {
    ...page,
    blockMap: { ...page.blockMap, [slotId]: { ...block, id: slotId } },
  };
  return { pages: newPages };
}),
```

**`updateSlotStatus`** — método auxiliar type-safe para atualizar status de SkeletonBlocks:

```typescript
updateSlotStatus(pageIndex: number, slotId: string, status: 'loading' | 'error', error?: string): void
```

Necessário porque `updateBlockContent` aceita `Partial<CanvasBlock>`, e `{ slotStatus: 'loading' }` não satisfaz nenhum variante do union discriminado. Este método faz o cast correto internamente.

Os métodos existentes (`addBlock`, `removeBlock`, `updateBlockContent`) não precisam de alteração.

### 4. Tool `fill_block`

Tool com async generator que preenche um slot declarado delegando a um sub-agente.

**Input:**
```typescript
{
  slotId: string;
  intent: string;              // Descrição do que calcular/consultar
  agentType: 'descriptive' | 'diagnostic' | 'predictive' | 'simulation' | 'prescriptive' | 'monitoring' | 'cashflow' | 'external';
}
```

**Execução (async generator):**

1. **Yield loading:**
   ```typescript
   yield { status: 'loading', slotId, pageIndex }
   ```
   → Frontend atualiza SkeletonBlock para `slotStatus: 'loading'` (animação pulse ativa)

2. **Executa sub-agente:**
   - Reutiliza `buildToolsForAgent` e `PROMPT_BUILDERS` de `analyze.ts` (extraídos para módulo compartilhado)
   - Usa `generateText` com model tier `'fast'` (mesmo que `analyze`)
   - O sub-agente recebe as tools do seu domínio + uma tool `submit_*_data` para entregar resultado estruturado
   - O prompt do sub-agente inclui instruções para chamar `submit_*_data` com os dados do bloco

3. **Extrai resultado:**
   - Escaneia `result.steps.flatMap(s => s.toolResults)` procurando `submit_*_data` tool result
   - A tool `submit_*_data` retorna os dados como output (passthrough)
   - `fill_block` converte o output em `CanvasBlock` concreto

4. **Yield ready:**
   ```typescript
   yield { status: 'ready', slotId, pageIndex, block: { ...canvasBlock } }
   ```
   → Frontend chama `replaceBlock` para substituir skeleton pelo bloco real

5. **Em caso de erro:**
   ```typescript
   yield { status: 'error', slotId, pageIndex, error: 'Mensagem de erro' }
   ```
   → Frontend atualiza SkeletonBlock para `slotStatus: 'error'`

**Todos os yields incluem `pageIndex`** para que o client possa resolver qual página atualizar sem manter um mapa separado.

**Localização:** `src/features/canvas-orchestrator/tools/fill-block.ts`

### 5. Sub-agente: Tools `submit_*_data`

Cada sub-agente invocado pelo `fill_block` recebe, além das tools do seu domínio, uma tool de entrega tipada. Qual tool é disponibilizada depende do `targetType` do slot:

```typescript
// Para slots type: "kpi"
submit_kpi_data({
  value: "R$ 245.3M",
  description: "Soma do saldo devedor de todos os contratos ativos",
  trend: "+2,3%",
  trendDirection: "up",
  trendIsPositive: false,
  sparklineData: [230, 235, 238, 240, 242, 243, 244, 244, 245, 245.3],
  sparklineMonths: ["2025-03", "2025-04", ...],
  previousValue: "R$ 240.0M",
  deltaPercent: "+2,2%"
})

// Para slots type: "chart"
submit_chart_data({
  chartType: "line",
  title: "Evolução Mensal",
  xAxisKey: "mes",
  dataKeys: ["saldo_devedor"],
  data: [{ mes: "2025-01", saldo_devedor: 230000000 }, ...]
})

// Para slots type: "table"
submit_table_data({
  title: "Top 10 Devedores",
  columns: [{ header: "Devedor", accessorKey: "devedor" }, ...],
  rows: [{ devedor: "Empresa X", saldo: 15000000 }, ...]
})

// Para slots type: "text"
submit_text_data({
  content: "## Análise\n\nO saldo devedor apresentou..."
})
```

**Implementação:** Cada `submit_*_data` é uma tool simples que retorna o input como output (passthrough). O `fill_block` encontra o resultado escaneando `result.steps.flatMap(s => s.toolResults).find(tr => tr.toolName.startsWith('submit_'))` e usa o `output` diretamente como dados do bloco.

**Localização:** `src/features/canvas-orchestrator/tools/submit-block-data.ts`

### 6. Shared Sub-agent Infrastructure

Para evitar duplicação entre `fill_block` e `analyze.ts`, extrair para módulo compartilhado:

**`src/features/canvas-orchestrator/lib/sub-agent.ts`**

Exporta:
- `AGENT_TYPE` (z.enum) — já existe em `analyze.ts`
- `PROMPT_BUILDERS` — já existe em `analyze.ts`
- `buildToolsForAgent(agentType, toolCtx, ctx)` — já existe em `analyze.ts`
- `runSubAgent({ agentType, query, ctx, extraTools? })` — novo helper que encapsula o `generateText` call

`analyze.ts` e `fill_block.ts` ambos importam deste módulo.

### 7. Paralelismo e Rate Limiting

O modelo Gemini suporta múltiplas tool calls no mesmo step. O Vercel AI SDK executa todas as tools de um step em paralelo (`Promise.all`). Quando o orchestrator emite 5-6 `fill_block` calls no mesmo step, todas executam concurrentemente.

**Mitigações:**
- **Rate limits Vertex AI:** Reutilizar `withRetry` (exponential backoff) de `create-agent-tool.ts` dentro do `fill_block`
- **Cap prático:** Máximo 6 `fill_block` calls por step (instruído via prompt). Se o layout tem mais de 6 blocos, o orchestrator chama em 2 batches
- **Model tier:** Sub-agentes usam `'fast'` (Gemini Flash) — mesmo tier que `analyze` já usa. Custo e latência menores que `'reasoning'`
- **Timeout por sub-agente:** Se um `fill_block` demora mais de 30s, yield error e seguir

**Fallback se modelo não paralelizar:** Se o Gemini chamar `fill_block` sequencialmente ao invés de em batch, funcionalidade não quebra — apenas é mais lento (igual ao fluxo atual). O prompt instrui parallelismo mas o sistema funciona em ambos os modos.

### 8. Tools de Adaptação

**`add_slot`** — adiciona bloco não previsto no plano original:

```typescript
{
  pageIndex: number;           // Qual página adicionar (obrigatório para multi-page)
  slotId: string;
  type: 'kpi' | 'chart' | 'table' | 'text';
  label: string;
  colSpan?: 1 | 2 | 3;
  position?: number;  // Índice no layout, default: final
}
```

Output: `{ action: 'add_slot', pageIndex, slotId }`

Efeito: adiciona `SkeletonBlock` ao canvas store → orchestrator chama `fill_block` depois.

**`remove_slot`** — remove bloco que não faz sentido:

```typescript
{
  pageIndex: number;           // Qual página (obrigatório para multi-page)
  slotId: string;
  reason?: string;
}
```

Output: `{ action: 'remove_slot', pageIndex, slotId }`

Efeito: remove bloco do canvas store.

**Localização:** `src/features/canvas-orchestrator/tools/adapt-layout.ts`

**`declare_layout` pode ser chamado múltiplas vezes** — cada chamada cria uma nova página. Não é idempotente. Se o orchestrator quiser reconstruir a mesma página, deve usar `remove_slot` + `add_slot`, ou a sequência `remove_block` + `add_slot` na página existente.

### 9. Mudanças no CanvasBlockRenderer

```typescript
function CanvasBlockRenderer({ block }: { block: CanvasBlock }) {
  // SkeletonBlock → mostra skeleton tipado
  if (block.type === 'skeleton') {
    if (block.slotStatus === 'error') {
      return <BlockError label={block.slotLabel} error={block.slotError} />;
    }
    return (
      <BlockSkeleton
        type={block.targetType}
        label={block.slotLabel}
        isLoading={block.slotStatus === 'loading'}
      />
    );
  }

  // Blocos concretos → renderiza normalmente (sem mudanças)
  switch (block.type) {
    case 'text': return <TextBlock block={block} />;
    case 'kpi': return <SingleKpiBlock block={block} />;
    case 'chart': return <ChartBlock block={block} />;
    case 'table': return <TableBlock block={block} />;
    // ...
  }
}
```

### 10. Mudanças no BlockSkeleton

O `BlockSkeleton` existente ganha:
- Prop `label?: string` — exibido como título sobre o skeleton (texto sutil sobre as shapes)
- Prop `isLoading?: boolean` — `true` ativa animação pulse, `false` mostra skeleton estático (pending)
- Mantém os shapes tipados por tipo de bloco (já existem para chart, table, text)
- Novo caso `type: 'kpi'` (singular) — skeleton de um único KPI card:
  ```typescript
  case 'kpi':
    return (
      <div className="space-y-2 rounded-xl border border-white/[0.06] p-4">
        {label && <p className="text-[10px] text-white/25 uppercase tracking-wider">{label}</p>}
        <Skeleton className={cn("h-7 w-24 bg-white/[0.06]", isLoading && "animate-pulse")} />
        <Skeleton className={cn("h-4 w-16 bg-white/[0.06]", isLoading && "animate-pulse")} />
        <Skeleton className={cn("h-10 w-full bg-white/[0.06]", isLoading && "animate-pulse")} />
      </div>
    );
  ```

### 10b. TOOL_LABELS no CanvasChat

Adicionar labels para as novas tools no map `TOOL_LABELS`:

```typescript
declare_layout: 'Planejando layout',
fill_block: 'Preenchendo bloco',
add_slot: 'Adicionando bloco',
remove_slot: 'Removendo bloco',
```

### 11. Mudanças no CanvasChat.tsx

Novos handlers no effect de processamento de tool results. Usa `toolPart.preliminary` (property real do Vercel AI SDK — já usada no AISidebar.tsx) para detectar yields intermediários.

**Dedup com `processedToolCalls`:** O Set existente usa `toolCallId` como chave. Para async generators (`fill_block`), o mesmo `toolCallId` emite múltiplos `output-available` com `preliminary: true` (yields) e um final com `preliminary: false`. Para evitar que o primeiro yield bloqueie os seguintes, usamos chave composta `${toolCallId}:${status}`:

```typescript
const DEFAULT_COL_SPANS: Record<string, number> = { kpi: 1, chart: 2, table: 3, text: 2 };

// Dentro do effect de processamento:

// Para fill_block, usar chave composta (mesmo toolCallId emite múltiplos status)
const dedupKey = toolName === 'fill_block'
  ? `${toolPart.toolCallId}:${(result as Record<string,unknown>).status}`
  : toolPart.toolCallId;
if (processedToolCalls.current.has(dedupKey)) continue;
processedToolCalls.current.add(dedupKey);

// declare_layout — output-available, preliminary: false (resultado final)
if (toolName === 'declare_layout') {
  const { pageTitle, pageDescription, blocks, filters, pageIndex: serverPageIndex } = result;
  const storePageIndex = canvasStore.getState().createPage(pageTitle, pageDescription);
  pageIndexMap.current.set(serverPageIndex, storePageIndex);
  for (const slot of blocks) {
    canvasStore.getState().addBlock(storePageIndex, {
      id: slot.slotId,
      type: 'skeleton',
      targetType: slot.type,
      colSpan: slot.colSpan ?? DEFAULT_COL_SPANS[slot.type],
      slotLabel: slot.label,
      slotStatus: 'pending',
    } satisfies SkeletonBlock);
  }
}

// fill_block — preliminary yields (loading/ready/error)
if (toolName === 'fill_block' && toolPart.state === 'output-available') {
  const { status, slotId, pageIndex: serverPageIndex, block, error } = result;
  const storePageIndex = pageIndexMap.current.get(serverPageIndex) ?? serverPageIndex;

  if (status === 'loading') {
    canvasStore.getState().updateSlotStatus(storePageIndex, slotId, 'loading');
  } else if (status === 'ready' && block) {
    canvasStore.getState().replaceBlock(storePageIndex, slotId, { ...block, id: slotId });
  } else if (status === 'error') {
    canvasStore.getState().updateSlotStatus(storePageIndex, slotId, 'error', error);
  }
}

// add_slot
if (toolName === 'add_slot') {
  const storePageIndex = pageIndexMap.current.get(result.pageIndex) ?? result.pageIndex;
  canvasStore.getState().addBlock(storePageIndex, {
    id: result.slotId,
    type: 'skeleton',
    targetType: result.type,
    colSpan: result.colSpan,
    slotLabel: result.label,
    slotStatus: 'pending',
  } satisfies SkeletonBlock, result.position);
}

// remove_slot
if (toolName === 'remove_slot') {
  const storePageIndex = pageIndexMap.current.get(result.pageIndex) ?? result.pageIndex;
  canvasStore.getState().removeBlock(storePageIndex, result.slotId);
}
```

### 12. Prompt do Canvas Orchestrator

Adicionar ao `buildCanvasOrchestratorPrompt`:

```
## Fluxo de Construção — Skeleton-Driven

Você DEVE seguir este fluxo ao construir novas páginas:

### Passo 1: Planeje e declare o layout
Chame declare_layout com TODOS os blocos que planeja criar. Defina tipo, label e colSpan para cada um.
O usuário verá skeletons imediatamente — isso melhora a experiência.

### Passo 2: Preencha em paralelo
Chame fill_block para TODOS os blocos no MESMO step. Cada fill_block delega para um sub-agente.
Máximo 6 fill_block por step. Se tem mais de 6 blocos, divida em 2 batches.

Escolha o agentType adequado para cada bloco:
- "descriptive" → KPIs, resumos, consultas de dados, estatísticas
- "diagnostic" → correlações, concentração, decomposição de variações
- "predictive" → projeções, tendências, PD/LGD, early warnings
- "simulation" → cenários, stress tests, sensibilidade
- "prescriptive" → recomendações, priorização
- "monitoring" → compliance, covenants, elegibilidade
- "cashflow" → WAL, excess spread, fluxos
- "external" → dados macro, Selic, IPCA

### Passo 3: Adapte se necessário
Após os fill_block completarem, analise os resultados:
- Se um resultado revela insight que merece destaque → add_slot + fill_block
- Se um slot não pôde ser preenchido → remove_slot
- Se precisa de bloco complementar → add_slot + fill_block

### Quando usar qual sistema
- **Criar página nova:** declare_layout + fill_block (skeleton-driven)
- **Editar página existente:** add_*_block / update_*_block / remove_block (tools existentes)
```

### 13. Error Handling

**Nível do slot (fill_block falha):**
- SkeletonBlock mostra estado de erro com mensagem
- Orchestrator pode retry com `fill_block` novamente ou `remove_slot`
- No retry, o segundo `fill_block` emite `status: 'loading'` → `updateSlotStatus` reseta o SkeletonBlock de `error` para `loading`, depois `status: 'ready'` → `replaceBlock` substitui normalmente

**Nível do declare_layout (tool falha):**
- Nenhuma página criada — erro visível no chat como tool error badge
- Orchestrator pode tentar novamente

**Todos os fill_block falham:**
- Página fica com todos os skeletons em estado de erro
- Orchestrator pode tentar abordagem diferente ou reportar falha no chat

**Timeout:**
- Cada `fill_block` tem timeout de 30s para o `generateText` call (passado via AbortController)
- Se timeout, yield error para aquele slot

### 14. Arquivos a Criar/Modificar

**Novos arquivos:**
- `src/features/canvas-orchestrator/tools/declare-layout.ts` — tool declare_layout
- `src/features/canvas-orchestrator/tools/fill-block.ts` — tool fill_block com async generator
- `src/features/canvas-orchestrator/tools/adapt-layout.ts` — tools add_slot e remove_slot
- `src/features/canvas-orchestrator/tools/submit-block-data.ts` — tools submit_*_data (internas do sub-agente)
- `src/features/canvas-orchestrator/lib/sub-agent.ts` — shared sub-agent infrastructure (extraído de analyze.ts)
- `src/pages/explore/ui/blocks/BlockError.tsx` — componente de erro inline para slots

**Arquivos modificados:**
- `src/shared/config/agents/types.ts` — adicionar `SkeletonBlock` ao union `CanvasBlock`
- `src/shared/config/agents/canvas-orchestrator.ts` — novo prompt com fluxo skeleton-driven
- `src/features/canvas-orchestrator/orchestrator.ts` — registrar novas tools (declare_layout, fill_block, add_slot, remove_slot)
- `src/features/canvas-orchestrator/tools/analyze.ts` — extrair `buildToolsForAgent`, `PROMPT_BUILDERS` para `lib/sub-agent.ts`, importar de lá
- `src/pages/explore/ui/CanvasChat.tsx` — handlers para declare_layout, fill_block, add_slot, remove_slot
- `src/pages/explore/ui/CanvasBlockRenderer.tsx` — case para `type: 'skeleton'`
- `src/pages/explore/ui/blocks/BlockSkeleton.tsx` — props `label` e `isLoading`, novo case `kpi` singular
- `src/shared/stores/canvas-store.ts` — novos métodos `replaceBlock` e `updateSlotStatus`
