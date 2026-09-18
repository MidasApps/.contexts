---
title: Regras de Performance
type: rules
scope: engineering
status: active
last_updated: 2026-07-13
related:
  - "@.contexts/engineering/rules/development.md"
  - "@.contexts/engineering/rules/security.md"
---

# Regras de Performance

Regras imperativas e enforce sobre performance de código. Cobrem rendering, bundle size, data fetching, queries de banco, streaming, cold starts, memoização, paralelismo e percepção de latência. Para regras gerais de desenvolvimento, ver `@.contexts/engineering/rules/development.md`. Estratégias detalhadas de caching vivem em `@.contexts/engineering/rules/caching.md`. Métricas, traces e SLOs vivem em `@.contexts/engineering/rules/observability.md`.

---

## 1. Rendering — Next.js 16 e React 19

- **Sempre** prefira Server Components por padrão. Marque com `"use client"` apenas o que precisa de estado, efeito, evento ou API do navegador.
- **Nunca** importe bibliotecas pesadas (Markdown renderers, syntax highlighters, libs de chart, SDKs de IA) em Client Components. Mantenha-as no servidor ou faça import dinâmico.
- **Sempre** mantenha a fronteira `"use client"` o mais profunda possível na árvore. Não suba `"use client"` para a raiz de uma rota por conveniência.
- **Nunca** passe objetos não-serializáveis (funções, classes, Date com side effects) de Server para Client Component. Use ISO strings e re-hidrate.
- **Sempre** use `<Suspense>` com `fallback` granular para isolar partes lentas da árvore. Streaming só funciona se houver boundary.
- **Nunca** bloqueie o root layout com fetch lento. Mova fetches para componentes específicos e isole com Suspense.
- **Sempre** prefira `loading.tsx` por segmento de rota em vez de spinner manual em layout compartilhado.
- **Nunca** chame `cookies()`, `headers()` ou `searchParams` no topo de um layout sem necessidade. Cada chamada opta-out de static rendering.
- **Sempre** revise o `dynamic` mode da rota (`force-static`, `force-dynamic`, `auto`). Default é `auto`; declare explícito quando o comportamento for crítico.

## 2. React 19 — re-render e memoização

- **Sempre** assuma que o React Compiler memoiza automaticamente. Não adicione `useMemo`/`useCallback` defensivamente.
- **Nunca** use `useMemo` para evitar re-render quando o custo do cálculo é trivial. Memoização tem custo de comparação.
- **Sempre** use `useMemo`/`useCallback` quando o valor for dependência de outro hook (`useEffect`, `useSyncExternalStore`) ou prop de componente memoizado fora do alcance do compiler.
- **Nunca** crie objetos, arrays ou funções inline em props de listas grandes (>100 itens) sem memoização. Cada nova referência invalida `React.memo`.
- **Sempre** use `key` estável e única em listas. Nunca use `index` como key em lista que reordena, filtra ou recebe itens novos no meio.
- **Nunca** use `key={Math.random()}` ou `key={Date.now()}`. Força remount em toda renderização.
- **Sempre** colocate state o mais próximo possível de onde é usado. Lift apenas quando dois componentes compartilham.
- **Nunca** armazene em state o que pode ser derivado de outro state. Calcule no render ou use `useMemo`.
- **Sempre** prefira `useTransition` para updates não urgentes (filtros, busca, navegação). Mantém input responsivo.

## 3. Bundle size — frontend

- **Sempre** rode `@next/bundle-analyzer` antes de mergear features que adicionam dependência client-side. Bundle inflado é regressão.
- **Nunca** importe a biblioteca inteira quando há subimport disponível. Errado: `import _ from 'lodash'`. Certo: `import debounce from 'lodash/debounce'`. Melhor: `lodash-es` com tree-shaking ou implementação própria para utilitários triviais.
- **Sempre** use `next/dynamic` com `ssr: false` para componentes pesados que dependem de `window` (editores, gráficos, mapas).
- **Nunca** importe ícones individuais de pacotes monolíticos sem tree-shaking comprovado. Use bibliotecas que exportam por ícone (`lucide-react` por subpath) ou SVG inline.
- **Sempre** prefira `next/image` para imagens raster. `<img>` cru desperdiça otimização automática.
- **Nunca** sirva PNG/JPG quando AVIF/WebP servem. Configure `images.formats` em `next.config.ts`.
- **Sempre** use `next/font` para fontes. Self-hosting com `next/font` evita CLS e elimina round-trip ao Google Fonts.
- **Nunca** carregue mais de um peso/estilo de fonte por família sem necessidade comprovada de design.
- **Sempre** declare `priority` em imagens above-the-fold (hero, LCP candidate) e nunca em imagens abaixo da dobra.
- **Nunca** importe SDKs de IA, Firebase Admin ou bibliotecas server-only em código que pode ser bundlado para o cliente. Use `import 'server-only'` para enforce.

## 4. Data fetching — Next.js App Router

- **Sempre** faça fetch no Server Component mais próximo de quem usa o dado. Não centralize fetches em layout para depois passar via props.
- **Nunca** faça waterfalls sequenciais quando os fetches são independentes. Use `Promise.all` ou inicie fetches em paralelo antes do primeiro `await`.
- **Sempre** use `fetch` nativo do Next em Server Components quando aplicável — ele tem deduplicação automática de requests idênticos no mesmo render.
- **Nunca** desabilite o cache do `fetch` (`cache: 'no-store'`) sem motivo. Avalie `revalidate: N` antes.
- **Sempre** declare `revalidate` explicitamente em rotas que servem dado quase-estático. Default implícito esconde decisão.
- **Nunca** chame APIs externas do Client Component quando o servidor pode chamar e passar o dado. Cliente paga round-trip do navegador + servidor.
- **Sempre** prefira Server Actions a route handlers `POST` para mutações disparadas do React. Menos boilerplate e integra com `revalidatePath`/`revalidateTag`.
- **Nunca** retorne payload gigante quando o cliente só precisa de subset. Projete apenas os campos usados.
- Para estratégias de cache (`unstable_cache`, tags, ISR, edge cache), ver `@.contexts/engineering/rules/caching.md`.

## 5. Streaming — LLM e Vercel AI SDK

- **Sempre** use streaming (`streamText`, `streamUI`) para respostas de LLM que excedem ~500ms de TTFB. Tempo até primeiro token é o KPI percebido.
- **Nunca** acumule a resposta inteira do LLM no servidor antes de enviar ao cliente. Pipe direto do provider para o response stream.
- **Sempre** use `useChat`/`useCompletion` do AI SDK no cliente. Reimplementar EventSource manualmente é fonte de bug.
- **Nunca** quebre o stream com transformações síncronas pesadas no meio. Mantenha o pipeline minimal entre provider e response.
- **Sempre** trate cancelamento (`AbortSignal`). Usuário que sai da página deve abortar a chamada upstream — desperdício de tokens é custo direto.
- **Nunca** rode chamada de LLM dentro de `Suspense` sem streaming. Suspense espera o promise resolver e perde o ganho do stream.
- **Sempre** prefira o modelo mais barato/rápido que atende. Custo e latência escalam com tamanho do modelo.
- **Nunca** envie histórico inteiro de conversa em toda chamada. Resuma ou truque com janela deslizante quando o contexto excede o necessário.

## 6. PostgreSQL e pgvector

- **Sempre** crie índice antes de promover query a produção. Query sem índice em coluna filtrada é regressão garantida sob carga.
- **Nunca** use `SELECT *` em código de produção. Liste colunas explicitamente — reduz I/O, evita quebra silenciosa em alterações de schema e melhora plan cache.
- **Sempre** use `EXPLAIN ANALYZE` em queries novas que tocam tabelas com mais de 10k linhas esperadas. Plan ruim é fácil de pegar antes do incidente.
- **Nunca** faça N+1: query dentro de loop sobre resultado de outra query. Use `JOIN`, `IN (...)`, `WITH` ou DataLoader pattern.
- **Sempre** pagine com cursor (`WHERE id > $last LIMIT N`) em vez de `OFFSET` para grandes datasets. `OFFSET` escaneia e descarta linhas.
- **Nunca** use `OFFSET` maior que algumas centenas. Cresce linearmente com a posição da página.
- **Sempre** prefira `LIMIT N` explícito em toda query que retorna lista. Sem limite é convite a memória estourada.
- **Nunca** retorne mais linhas do que a UI vai renderizar. Filtre e pagine no banco, não em memória.
- **Sempre** use `IVFFLAT` ou `HNSW` em colunas `vector` antes de consultas em produção. Busca vetorial sem índice é sequential scan disfarçado.
- **Nunca** crie índice `HNSW` em pgvector sem dimensionar `m` e `ef_construction` para o dataset. Defaults raramente são ótimos.
- **Sempre** ajuste `ef_search` (HNSW) ou `probes` (IVFFLAT) por query para o tradeoff recall vs latência da feature.
- **Nunca** misture filtros muito seletivos com busca ANN em uma única query sem `WHERE` pré-filtrante adequadamente indexado. Combine com índice B-tree composto ou pré-filtre.
- **Sempre** use pool de conexões (`pg-pool`, PgBouncer no transaction mode para Functions). Conexão por request mata performance em serverless.
- **Nunca** abra transação que segura conexão durante chamada HTTP externa ou cálculo lento. Mantenha transações curtas.

## 7. Firestore

- **Nunca** faça N+1 em Firestore: loop chamando `doc().get()`. Use `getAll()`, `where('id', 'in', [...])` (até 30 itens) ou denormalize.
- **Sempre** projete documentos para o padrão de leitura. Firestore cobra por documento lido — denormalize quando reads dominam writes.
- **Nunca** liste coleções com `.get()` sem `.limit()`. Custo cresce linearmente com o tamanho da coleção.
- **Sempre** crie índices compostos antes de promover query com múltiplos `where` + `orderBy`. Console alerta, mas o ideal é declarar em `firestore.indexes.json`.
- **Nunca** use `array-contains-any` ou `in` com mais de 30 valores. Limite atual do Firestore — quebre em chamadas paralelas se necessário.
- **Sempre** pagine com `startAfter(lastDoc)` em listas. Não recarregue do zero a cada página.
- **Nunca** mantenha listener (`onSnapshot`) ativo em componente desmontado. Memory leak e billing leak.
- **Sempre** prefira batch writes (`writeBatch`) ou transações para mutações múltiplas relacionadas. Limite de 500 ops por batch.
- **Nunca** modele contador hot em um único documento (>1 write/segundo). Use distributed counter com shards.
- Para convenções de modelagem que afetam performance estruturalmente, ver `@.contexts/engineering/contracts/firebase-firestore.md`.

## 8. Firebase Functions — cold start

- **Sempre** declare `minInstances` em Functions críticas em latência (autenticação, webhooks de pagamento, endpoints síncronos chamados em hot path). Cold start de Node em GCF v2 custa centenas de ms.
- **Nunca** importe `firebase-admin` ou SDKs pesados no topo de bundle de Function sem necessidade. Lazy import dentro do handler quando o caminho não usa.
- **Sempre** reuse instâncias entre invocações (`admin.initializeApp()` no escopo de módulo, conexões de banco no top-level). Function instance vive enquanto está warm.
- **Nunca** abra conexão de PostgreSQL nova a cada invocação. Use pool no escopo de módulo, configurado para tamanho mínimo.
- **Sempre** declare `concurrency` adequada em Functions v2 (default 80). Workload I/O-bound se beneficia; CPU-bound não.
- **Nunca** rode trabalho pesado de CPU em Function HTTP síncrona. Empurre para Pub/Sub + Function de background ou Cloud Run com timeout maior.
- **Sempre** declare `memory` e `cpu` proporcionalmente ao workload. CPU em GCF v2 escala com memória — Function memory-starved fica CPU-starved também.
- **Nunca** deixe Function rodando mais que o necessário. Defina `timeoutSeconds` explícito; default de 60s é frequentemente alto demais.

## 9. Async e paralelismo

- **Sempre** rode operações independentes em paralelo com `Promise.all`. `await` sequencial em loop é o anti-pattern mais comum de latência.
- **Nunca** use `Promise.all` quando uma falha precisa abortar todas. Use `Promise.all` quando todas devem suceder; `Promise.allSettled` quando falha parcial é aceitável.
- **Sempre** limite concorrência ao iterar sobre coleções grandes. `Promise.all` de 10k requests derruba upstream. Use `p-limit` ou batching manual.
- **Nunca** dispare fire-and-forget (`promise` sem `await` e sem handler) em runtimes serverless. Function pode terminar antes da promise resolver.
- **Sempre** propague `AbortSignal` por toda a cadeia. Request cancelado deve cancelar fetches e queries downstream.
- **Nunca** crie `setTimeout`/`setInterval` em handler sem limpar. Em Functions warm, timer sobrevive entre requests.

## 10. Memória e CPU

- **Nunca** carregue arquivos inteiros em memória quando processamento streaming é possível. Use `Readable`/`Writable` streams do Node para uploads grandes, parsing de CSV, transformação de dados.
- **Sempre** processe coleções grandes em chunks. `array.map(heavy)` sobre 1M itens bloqueia event loop.
- **Nunca** faça JSON.parse/stringify de payloads gigantes em código quente. Considere streaming parsers (`stream-json`) ou formato binário.
- **Sempre** liberte referências a buffers grandes assim que possível. Setar para `null` ou sair de escopo ajuda o GC.
- **Nunca** use estruturas de dados O(n²) sobre input não limitado. Algoritmo é gargalo silencioso até o input crescer.

## 11. Latência percebida

- **Sempre** trate p99 como o SLO real. Média esconde caudas.
- **Sempre** mostre skeleton ou estado de loading determinístico em vez de spinner genérico. Skeleton reduz percepção de espera.
- **Nunca** mostre layout shift após carregamento. Reserve espaço com `aspect-ratio`, `min-height` ou dimensões explícitas em imagens.
- **Sempre** prefira optimistic UI para mutações cujo erro é raro (likes, marcações). Reverter no erro é melhor UX que esperar.
- **Nunca** revalide o layout inteiro quando só um fragmento mudou. Use `revalidatePath` com path específico ou `revalidateTag`.
- **Sempre** prefetch rotas previsíveis com `<Link prefetch>` quando o usuário provavelmente vai navegar. Não prefetch tudo — desperdiça banda.
- **Nunca** bloqueie a interação até telemetria, analytics ou A/B test loader resolver. Carregue async, com fallback.

## 12. Métricas alvo

- **Sempre** vise LCP <2.5s, INP <200ms, CLS <0.1 em p75 mobile para páginas públicas. Core Web Vitals são gate de SEO e UX.
- **Sempre** vise TTFB <600ms em rotas server-rendered. Acima disso, investigue cold start, fetch waterfall ou query lenta.
- **Sempre** vise tempo até primeiro token (TTFT) <1s em features de chat. Acima disso, percepção quebra mesmo com streaming.
- **Sempre** meça antes de otimizar. Otimização sem profiling vira complexidade gratuita.
- Para definição de SLOs, dashboards e alertas, ver `@.contexts/engineering/rules/observability.md`.

## 13. Anti-patterns universais

- `await` dentro de `for` quando as iterações são independentes.
- `JSON.parse(JSON.stringify(obj))` como deep clone em hot path. Use `structuredClone`.
- `useEffect` para fetch em Client Component quando o dado pode vir do servidor.
- Centralizar todo state global em um único Zustand store gigante que invalida componentes não relacionados.
- Importar `dayjs`/`moment` quando `Intl.DateTimeFormat` resolve.
- `console.log` em loop quente — formatar string é caro.
- Re-renderizar lista inteira quando muda um único item porque a key é `index`.
- Função de cálculo pesado executada no render sem `useMemo`, dependendo só do React Compiler para todo edge case.
- Query Firestore com `.get()` sem `.limit()` "porque a coleção é pequena hoje".
- Index criado em produção via console em vez de versionado em `firestore.indexes.json`.

## Referências cruzadas

- Regras gerais de desenvolvimento: `@.contexts/engineering/rules/development.md`
- Regras de segurança que afetam decisões de performance (rate limiting, validação): `@.contexts/engineering/rules/security.md`
- Estratégias de caching (HTTP, ISR, `unstable_cache`, tags, Redis): `@.contexts/engineering/rules/caching.md`
- Métricas, traces, SLOs e dashboards: `@.contexts/engineering/rules/observability.md`
- Stack Next.js 16: `@.contexts/engineering/stacks/frontend/next@16.md`
- Stack React 19: `@.contexts/engineering/stacks/frontend/react@19.md`
- Stack PostgreSQL: `@.contexts/engineering/stacks/database/postgres.md`
- Stack pgvector: `@.contexts/engineering/stacks/database/pgvector.md`
- Stack Firebase Firestore: `@.contexts/engineering/stacks/database/firebase-firestore.md`
- Stack Firebase Functions: `@.contexts/engineering/stacks/backend/firebase-functions.md`
- Stack Vercel AI SDK: `@.contexts/engineering/stacks/ai/vercel-ai-sdk.md`
- Convenções de modelagem Firestore: `@.contexts/engineering/contracts/firebase-firestore.md`
