# Filtros só quando pedidos — plano

**Pedido:** manter apenas os filtros padrão (período, modo de visualização,
comparar períodos, testar como usuário, debug). O resto sai, e a IA passa a
criar filtro na página quando o usuário pedir — só quando pedir.

## O que a investigação mostrou

| Fato | Evidência |
|---|---|
| Os 6 "filtros avançados" (Rating, Elegibilidade, Faixa LTV, Faixa de Atraso, Tipo Proponente, Grupo Repasse) têm opções **literais no código**, não vindas do dado | `DataProvider.tsx:45-61` |
| Eles e o filtro **Empreendimentos** só chegam à consulta pela via *ambient* (`{ambient:entity}` no template ou recipe `aggregation`) | `resolve-metric.ts:368,446` |
| `{ambient` aparece **0 vezes** nas 64 métricas `covenants.*`, e o catálogo tem **0** recipes `aggregation` | `grep -c "{ambient" scripts/metrics/covenants-v2.mjs` → 0; `grep -c "^  agg({"` → 0 |
| Nenhum template declara filtro `in` sem `control: 'dropdown'` — ou seja, nada é alimentado pelo Empreendimentos global | os 5 `kind:'in'` dos templates têm `control` |

**Conclusão:** para o único tenant em produção, esses controles não filtram
nada. Mexer neles não muda número nenhum na tela. Não é remover
funcionalidade — é remover uma promessa que a interface não cumpre.

O que eles ainda alcançavam era o **prompt**: `shared-context.ts:77-91` injeta
"Projetos filtrados: …" e um trecho `AND projeto IN (…)` para o `execute_sql`
dos sub-agentes. Some junto.

## Decisões

1. **Saem do painel:** Empreendimentos e a seção "Filtros" (os 6 avançados).
2. **Ficam:** período analisado, modo de visualização, comparar períodos,
   testar como usuário, modo debug, e a ação de exportar PDF (não é filtro).
   Os cinco fazem sentido e ficam como estão.
3. **Ficam também os filtros de PÁGINA já declarados** (Tipo/Categoria/Banco no
   Extrato, etc.): são por página, vêm de dado real via
   `/api/metrics/filter-values` e funcionam. São exatamente a mesma coisa que a
   IA passa a criar — tirá-los seria apagar de 10 templates o que o assistente
   recriaria na conversa seguinte. Se algum incomodar, a IA agora remove.
4. **A IA cria filtro de página** escrevendo `filters.metricPageFilters` no
   documento do relatório — o mesmo caminho de `create_report_page`, não o
   canvas: o `handleSave` grava só `blockMap` e `layout`, então filtro que
   viajasse pelo canvas se perderia no salvamento.

## Arquivos

**Remoção**
- `src/shared/providers/DataProvider.tsx` — sai `AdvancedFilters`,
  `ADVANCED_FILTER_OPTIONS/LABELS`, `advancedFilters`, `projetos`,
  `projetoOptions`, `activeFilterCount`.
- `src/widgets/filter-panel/ui/FilterPanel.tsx` — sai a seção "Filtros", o card
  Empreendimentos, o resumo de badges e o botão "Limpar".
- `src/widgets/global-filters/ui/GlobalFilters.tsx` — mesmo corte (é o painel do
  editor de template).
- `src/widgets/client-switcher/ui/{ClientSwitcher,TopbarClientSwitcher}.tsx` —
  param de guardar/restaurar esses campos por cliente.
- `src/shared/lib/metrics/dashboard-ambient.ts` (+ teste) — deletado; sem os
  controles não há o que mapear. `useReportData` passa a mandar `[]`.
- `src/shared/config/agents/{types,shared-context}.ts` — `ChatRequestFilters`
  perde `projetos`/`advancedFilters`; o prompt perde as duas seções.
- `src/widgets/ai-sidebar/ui/AISidebar.tsx` — para de enviá-los.

**Novo**
- `src/features/ai-agents/tools/filters/add-page-filter.ts` — declara um filtro
  na página (`kind:'in'`, `control:'dropdown'`), validando o atributo contra o
  contrato do cliente.
- `.../remove-page-filter.ts` — tira um filtro declarado.
- Front: `ReportPage` recarrega o relatório quando a IA mexe nos filtros.
- Seção de prompt: filtro só quando pedido.

## Fora de escopo

- Migrar os filtros já gravados nos relatórios de produção.
- Filtro de página `kind: 'date_range'`/`'snapshot'` pela IA (são o eixo de
  tempo da página, decidido pelo template).
