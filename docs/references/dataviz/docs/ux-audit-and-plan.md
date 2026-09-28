# Liquid DataViz — Auditoria de UX e Plano de Melhorias

**Versão:** 2.0
**Data:** 13 de março de 2026
**Autor:** Análise de UX Especializada (Opus 4.6)
**Escopo:** Auditoria completa pós-Sprint 2: 13 páginas, 10 widgets, navegação, gráficos, acessibilidade, mobile, IA

---

## Sumário Executivo

Este documento é uma auditoria de UX de segunda geração, realizada após a implementação parcial do plano v1.0. A análise examina o estado atual do código-fonte (branch `master`), screenshots da interface e as convenções já estabelecidas nos Sprints 1 e 2.

**O que já foi implementado (Sprint 1 e 2):**
- Acentuação corrigida em toda a interface
- Símbolo R$ adicionado ao `formatCurrency`
- Subtítulos descritivos em todas as páginas, gráficos e tabelas
- InfoTooltip com glossário centralizado (`glossary.ts` com 27 termos)
- Títulos padronizados (h2 single-line + subtitle em `text-white/40`)
- Agrupamento semântico no NavSidebar (CARTEIRA, RISCO, OPERACIONAL)
- Cores do BottomTabBar corrigidas para `#F3A169`
- Ícones nos itens de Anexos
- Mensagens de erro sanitizadas (sem detalhes de BigQuery)
- Subtítulos nas tabs (e.g., "Resumo por Empreendimento", "Por Rating Liquid")
- Títulos específicos nas páginas de Anexo

**O que permanece aberto ou requer nova análise:**
37 achados, distribuídos em 3 P0, 12 P1, 14 P2 e 8 P3.

---

## 1. Diagnóstico Pós-Implementação

### 1.1 Pontos Fortes Consolidados

- **Hierarquia visual dos KPIs no Dashboard:** Cards com ícones, sparklines em AreaChart, badges de variação coloridos e botão de expansão para modal com gráfico ampliado. Excelente progressive disclosure.
- **Paleta semântica para risco:** Gradiente olive (#576558) → orange (#F3A169) nas faixas de atraso cria leitura intuitiva. As 8 cores de rating (A-H) estão bem mapeadas em `chart-theme.ts`.
- **Glossário centralizado:** 27 termos em `glossary.ts` com componente `InfoTooltip` reutilizável, aceita tanto `term` quanto `text` livre.
- **Navegação agrupada:** Itens organizados em CARTEIRA, RISCO, OPERACIONAL com separadores e labels de grupo.
- **Responsividade mobile:** BottomTabBar com 4 itens fixos + menu "Mais" em grid 3x3, NavSidebar em Sheet, AISidebar em Sheet.
- **Design system coerente:** OKLCH colors, dark mode consistente, card com gradient border (`from-white/[0.08]`), animações com `prefers-reduced-motion` respeitado.
- **Empty state e loading:** Skeletons em todas as páginas, `EmptyState` com ícone, título, descrição e ação opcional.
- **ErrorBoundary:** Componente class-based com UI de recovery ("Tentar novamente").

### 1.2 Panorama de Problemas Remanescentes e Novos

| Severidade | Quantidade | Categorias Principais |
|-----------|-----------|----------------------|
| P0 (Crítico) | 3 | Inconsistência de KpiCard, paginação ausente, eixo X genérico |
| P1 (Major) | 12 | Contraste WCAG, acessibilidade gráficos, filtros sem feedback, tabelas largas |
| P2 (Minor) | 14 | Exportação CSV, comparação visual, codificação de cor, drill-down |
| P3 (Enhancement) | 8 | Atalhos de teclado, favoritos, alerta de threshold, light mode |

---

## 2. Achados por Categoria

### 2.1 COMPONENTES E CONSISTÊNCIA

#### P0-COMP-01: Dois componentes KpiCard incompatíveis coexistem

**Problema:** O Dashboard usa um KpiCard inline (definido dentro de `DashboardPage.tsx`, linhas 157-294) com ícones Lucide, sparklines em AreaChart do Recharts, badges de variação coloridos e botão de expansão. As páginas Pricing, Simulação, Elegibilidade e Repasse usam o widget `KpiCard` de `kpi-grid/ui/KpiCard.tsx`, que tem API diferente (props `value: string` vs `value: number`), visual diferente (gradient text, MiniBarChart com barras ao invés de area), e sem ícone nem botão de expansão.

**Evidência:** Heurística de Nielsen #4 (consistência e padrões). O usuário espera que KPIs se comportem identicamente em toda a plataforma.

**Impacto:** Experiência fragmentada. O Dashboard transmite sofisticação analítica; as demais páginas parecem uma versão "inferior". Gestores de fundo que veem o Dashboard e depois navegam para Pricing percebem a queda de qualidade.

**Localização:**
- `src/pages/dashboard/ui/DashboardPage.tsx` (linhas 157-294) — KpiCard inline
- `src/widgets/kpi-grid/ui/KpiCard.tsx` — KpiCard widget

**Correção recomendada:**
Unificar em um único componente com variantes:
- `variant="rich"`: ícone + sparkline AreaChart + badge + botão expansão (Dashboard)
- `variant="compact"`: valor + label + trend badge + mini bar chart opcional (páginas secundárias)
- Ambos devem compartilhar o mesmo container visual (border gradient, background `#0A0B10`)
- API unificada: aceitar tanto `value: number` com `format` quanto `value: string`

**Implementação:** Mover o KpiCard do Dashboard para `src/widgets/kpi-grid/ui/KpiCard.tsx`, absorvendo a API do widget atual como variante compact.

---

#### P0-COMP-02: Tabelas sem paginação — risco de performance e sobrecarga cognitiva

**Problema:** O `DataTableWidget` não implementa paginação. A página Detalhamento pode ter centenas de contratos renderizados simultaneamente. A página Elegibilidade empilha 6+ tabelas sem paginação. O TanStack Table já oferece `getPaginationRowModel()` que não está sendo utilizado.

**Evidência:** Performance percebida e Teoria da Carga Cognitiva. Renderizar 500+ linhas DOM simultaneamente degrada scroll e dificulta scan visual.

**Impacto:** Performance degradada em dispositivos móveis, scroll infinito sem referência posicional, impossibilidade de "encontrar" um contrato específico sem Ctrl+F.

**Correção recomendada:**
- Adicionar paginação ao DataTableWidget: 10/25/50 linhas por página, configurável via prop `pageSize`
- Exibir contagem: "Mostrando 1-25 de 278 contratos"
- Implementar com `getPaginationRowModel()` do TanStack Table
- Footer de paginação com botões Anterior/Próximo e seletor de tamanho de página
- Considerar virtualização (react-virtual) para a página Detalhamento como alternativa

---

#### P0-COMP-03: Eixo X do gráfico de evolução no Dashboard sem referência temporal

**Problema:** O gráfico "Evolução do Saldo Devedor" no Dashboard exibe `M1`, `M2`, `M3`... como labels do eixo X (linha 448: `tickFormatter={(v) => \`M${v + 1}\`}`). São labels ordinais sem significado temporal. O mesmo ocorre no modal expandido do KPI (linha 662). O hook `useKpiHistory` retorna apenas arrays numéricos sem datas associadas.

**Evidência:** Princípio de data-ink ratio (Tufte). Cada pixel deve transmitir informação útil. Labels genéricos desperdiçam o espaço do eixo.

**Impacto:** Impossibilita correlacionar eventos macroeconômicos (alta de Selic, mudança regulatória) com movimentos no gráfico. Decisões temporais ficam comprometidas.

**Correção recomendada:**
- Modificar `useKpiHistory` para retornar `{ date: string; value: number }[]`
- Substituir `tickFormatter` por labels reais: "jan/25", "fev/25"
- No tooltip, exibir a data completa: "Janeiro de 2025"

---

#### P1-COMP-04: Filtros globais sem feedback de estado aplicado

**Problema:** Os GlobalFilters (`MonthRangePicker` + `MultiSelectCombobox` + Switch "Comparar") não exibem indicação visual de que filtros estão ativos. Se o usuário selecionar "VIVA PARK" como empreendimento, não há badge nem indicador.

**Evidência:** Heurística de Nielsen #1 (visibilidade do estado do sistema).

**Impacto:** Usuário pode não perceber que está visualizando dados filtrados, levando a interpretação incorreta.

**Correção recomendada:**
- Badge de contagem no MultiSelectCombobox quando há seleção: "2 de 5"
- Botão "Limpar filtros" (X) quando qualquer filtro difere do padrão
- Opcional: barra de contexto fina abaixo da AppBar: "jan/2025 - jan/2026 | VIVA PARK"
- Quando "Comparar" ativo, exibir tooltip mostrando o período de comparação

---

#### P1-COMP-05: Toggle "Comparar" ativável mas sem efeito visual nos dados

**Problema:** O Switch "Comparar" nos GlobalFilters altera `ctx.compareEnabled`, mas nenhuma página atualmente renderiza dados comparativos. O toggle existe na interface sem funcionalidade visível para o usuário.

**Evidência:** Heurística de Nielsen #1 (visibilidade) e #2 (correspondência). Um controle que não produz efeito observável confunde o usuário.

**Impacto:** Usuário ativa o toggle, não vê diferença, e perde confiança no sistema.

**Correção recomendada:**
- Implementar comparação period-over-period nos KPIs (delta badge vs período anterior)
- Nos gráficos, adicionar linha tracejada para o período de comparação
- Se a implementação de comparação não for viável no curto prazo, ocultar o toggle temporariamente ou desabilitar com tooltip: "Em breve"

---

#### P1-COMP-06: Tabela de Repasse com 15 colunas — overflow horizontal crítico

**Problema:** A tabela "Grupos de Estratégia de Repasse" na `RepassePage` define 15 colunas. A tabela "Resumo por Empreendimento" na `ContratosPage` define 12 colunas. Ambas causam overflow horizontal em qualquer resolução de tela.

**Evidência:** Stephen Few recomenda max 7-8 colunas visíveis simultaneamente. Scroll horizontal é interação de alto custo.

**Correção recomendada:**
- Implementar `columnVisibility` do TanStack Table com dropdown de seleção de colunas
- Primeira coluna sticky (nome do grupo/projeto) para manter contexto durante scroll horizontal
- Alternativa: mostrar 6-7 colunas-chave e botão "Todas as colunas" para revelar as demais

---

#### P2-COMP-07: Exportação CSV restrita à página de Detalhamento

**Problema:** Apenas `DetalhamentoPage` oferece exportação CSV via componente `ExportBar`. Páginas como PDD, Pricing e Repasse também precisam exportar dados para relatórios CVM, auditorias e comitês.

**Correção recomendada:**
- Adicionar prop `exportable?: boolean` ao `DataTableWidget`
- Quando ativo, renderizar botão "Exportar CSV" no header do card
- Reutilizar a lógica de exportação já existente no `ExportBar`

---

#### P2-COMP-08: Dashboard KpiCard não usa glossário nos tooltips do sparkline

**Problema:** Os sparklines nos KPI Cards do Dashboard mostram tooltip com valor formatado, mas não há contexto sobre o que representa cada ponto. O tooltip do sparkline é apenas `{config.format(payload[0].value)}`. Sem data ou explicação.

**Correção recomendada:**
- Incluir data no tooltip do sparkline: "jan/2025: R$ 412,0 mi"
- Depende da resolução de P0-COMP-03 (retorno de datas pelo hook)

---

### 2.2 ACESSIBILIDADE (WCAG 2.1)

#### P1-ACESS-01: Textos com contraste abaixo de WCAG AA

**Problema:** Mesmo após o Sprint 2, vários elementos mantêm opacidades baixas:
- Subtítulos de gráficos: `text-white/30` em `ChartCard` do Dashboard (linha 318: `text-[11px] text-white/30`)
- Legenda de gráficos: `rgba(255,255,255,0.45)` em `CHART_LEGEND_STYLE`
- Eixos de gráficos: `rgba(255,255,255,0.35)` em `CHART_AXIS_STYLE`
- Labels de navegação inativos: `text-white/50` no `NavItem`
- Label de grupo do NavSidebar: `text-white/30` (linha 91)
- Texto "Securitização Imobiliária" na sidebar: `text-white/50` (linha 60)
- Labels do BottomTabBar inativos: `text-white/25` (linhas 88, 110)

Cálculo: branco 30% sobre `#0A0B10` resulta em ~`#4D4D54`, ratio ~2.8:1 (mínimo WCAG AA para texto pequeno: 4.5:1).

**Evidência:** WCAG 2.1 critério 1.4.3.

**Correção recomendada:**

| Elemento | Atual | Mínimo Recomendado | Ratio Estimado |
|----------|-------|-------------------|----------------|
| Subtítulos chart/table | `text-white/30` | `text-white/50` | ~4.5:1 |
| Legenda de gráficos | `opacity 0.45` | `opacity 0.60` | ~4.8:1 |
| Eixos de gráficos | `opacity 0.35` | `opacity 0.50` | ~4.5:1 |
| Nav labels inativos | `text-white/50` | `text-white/55` | ~4.5:1 |
| Labels grupo sidebar | `text-white/30` | `text-white/45` | ~4.0:1 |
| BottomTabBar inativos | `text-white/25` | `text-white/45` | ~4.0:1 |

---

#### P1-ACESS-02: Gráficos sem texto alternativo

**Problema:** Nenhum dos gráficos Recharts possui `aria-label`, `role="img"` ou fallback textual. Os containers `<ResponsiveContainer>` e `<div style={{ height }}>` são divs vazios para leitores de tela.

**Evidência:** WCAG 2.1 critério 1.1.1 (alternativas textuais).

**Correção recomendada:**
- Adicionar `role="img"` e `aria-label` descritivo ao `<div>` que envolve cada gráfico
- Exemplo: `aria-label="Gráfico de barras: distribuição de 278 contratos por faixa de atraso"`
- No `ChartWidget`, adicionar prop `ariaLabel` e aplicá-la automaticamente
- Para gráficos complexos, fornecer link "Ver dados em tabela" como alternativa

---

#### P2-ACESS-03: Botão de collapse da sidebar com área de toque insuficiente

**Problema:** O botão de minimizar menu na `NavSidebar` tem `h-7 w-7` (28x28px), abaixo dos 44x44px recomendados pelo WCAG 2.5.5.

**Localização:** `NavSidebar.tsx`, linha 65.

**Correção recomendada:** Aumentar para `h-9 w-9` (36px) ou usar padding invisível para ampliar área de toque.

---

#### P2-ACESS-04: Cores como único meio de diferenciar faixas de risco

**Problema:** Nos gráficos de faixa de atraso e distribuição de rating, a cor é o único diferenciador visual entre categorias. Usuários com daltonismo (protanopia, deuteranopia) podem não distinguir olive de orange.

**Evidência:** WCAG 2.1 critério 1.4.1 (uso de cor).

**Correção recomendada:**
- Adicionar padrões (hachuras) ou texturas distintas para cada faixa nas barras empilhadas
- Alternativa mais simples: adicionar labels diretamente nas barras com valores percentuais
- Na legenda, incluir ícones ou numeração além da cor

---

### 2.3 NAVEGAÇÃO E ARQUITETURA DE INFORMAÇÃO

#### P1-NAV-01: Página "Elegibilidade" continua com conteúdo misto

**Problema:** O item de navegação diz "Elegibilidade" (grupo OPERACIONAL), mas o título h2 da página é "Análise de Inadimplência". O conteúdo real inclui 5 abas (LTV e Inadimplência, Por Safra, Por Faixa de Atraso, Matriz de Cobrança, Restrições Cadastrais). Apenas a relação LTV-elegibilidade se encaixa no label de navegação.

**Evidência:** Princípio de "information scent" (Spool). Label de navegação que não corresponde ao conteúdo reduz confiança na estrutura.

**Impacto:** Usuários buscando critérios de elegibilidade vão a esta página e encontram análise de inadimplência. Usuários buscando análise de inadimplência não clicariam em "Elegibilidade".

**Correção recomendada:**
- **Opção A (recomendada):** Renomear para "Inadimplência" na navegação e no título. Mover critérios de elegibilidade do Anexo para uma aba "Critérios" dentro desta mesma página.
- **Opção B:** Separar em duas páginas: "Inadimplência" (LTV, Safra, Faixa, Matriz, Restrições) e "Elegibilidade" (critérios de elegibilidade).

---

#### P1-NAV-02: Sidebar colapsada oculta totalmente os Anexos

**Problema:** Quando a sidebar está no modo `collapsed`, os itens de Anexos são completamente ocultos (linhas 108-144 do `NavSidebar.tsx`: `{!collapsed && (...)}` para Anexos, e no modo collapsed apenas um botão de expandir é mostrado). Não há ícone ou indicação dos Anexos no modo collapsed.

**Evidência:** Heurística de Nielsen #6 (reconhecimento sobre recordação). Conteúdo que desaparece completamente não pode ser reconhecido.

**Correção recomendada:**
- No modo collapsed, exibir um único ícone representando "Anexos" (e.g., `BookMarked`) com tooltip
- Ao clicar, abrir popover com os 3 itens de anexo

---

#### P2-NAV-03: Menu "Mais" do BottomTabBar sem indicação visual do item ativo

**Problema:** Quando o usuário está em uma página acessada pelo menu "Mais" (PDD, Pricing, etc.), o botão "Mais" fica destacado mas o menu em si não está aberto. O usuário não vê qual sub-item está ativo sem abrir o menu.

**Correção recomendada:**
- Substituir o label "Mais" pelo label da página ativa quando o usuário está em uma página do menu "Mais" (e.g., "PDD" aparece no lugar de "Mais" com ícone diferente)
- Alternativa: manter "Mais" mas adicionar dot indicator no ícone

---

#### P2-NAV-04: Ausência de breadcrumbs em páginas de Anexo

**Problema:** As páginas de Anexo (Rating, PDD, Elegibilidade) não têm indicação hierárquica. O título na AppBar mostra "Anexo: Rating Liquid" mas não há breadcrumb mostrando o caminho.

**Correção recomendada:** Adicionar breadcrumbs simples: `Início > Anexos > Rating Liquid`.

---

### 2.4 VISUALIZAÇÃO DE DADOS E GRÁFICOS

#### P1-VIS-01: Página de PDD sem nenhuma visualização gráfica

**Problema:** A página PDD consiste apenas em uma `DataTableWidget` e um texto explicativo. É a única página de dados que não tem gráfico. A comparação PDD Liquid vs PDD Bacen é ideal para visualização, mas está apenas em formato tabular.

**Evidência:** Tufte: comparações numéricas são mais facilmente interpretadas como gráficos de barras agrupadas ou divergentes.

**Correção recomendada:**
1. Adicionar KPIs resumo: Total PDD Liquid, Total PDD Bacen, Delta Total
2. Gráfico de barras agrupadas: PDD Liquid vs PDD Min. Bacen por Rating
3. Gráfico de barras divergentes para Delta PDD (positivo = Liquid > Bacen)
4. Manter a tabela como complemento detalhado

---

#### P1-VIS-02: Gráficos de Pagamentos com eixo X cortado

**Problema:** O gráfico "Composição dos Pagamentos" na `PagamentosPage` usa `angle={-45}` no eixo X com `height={60}`, mas labels de datas longas (e.g., "2024-01") podem ser cortados na área visível.

**Correção recomendada:**
- Formatar datas do eixo X como "jan/24" usando `formatDate` já existente
- Aumentar height para 70 se necessário
- Considerar rotação de -30 graus ao invés de -45 para melhor legibilidade

---

#### P1-VIS-03: Tooltip dos gráficos empilhados mostra valor absoluto em gráfico percentual

**Problema:** Na `ElegibilidadePage`, aba "Faixa de Atraso", os gráficos de "Valor em Atraso por Faixa" e "Saldo Devedor por Faixa" usam `stackOffset="expand"` (100% stacked) mas o tooltip formata com `formatCurrency` (valor absoluto), não percentual. O eixo Y mostra `%` mas o tooltip mostra `R$`.

**Evidência:** Princípio de consistência de codificação (Few). Eixo e tooltip devem comunicar a mesma unidade.

**Localização:** `ElegibilidadePage.tsx`, linhas 294, 318.

**Correção recomendada:**
- Para gráficos com `stackOffset="expand"`, o tooltip deve exibir percentuais: `formatter={(value) => \`${((value as number) * 100).toFixed(1)}%\`}`
- Adicionar também o valor absoluto entre parênteses para contexto completo

---

#### P2-VIS-04: Codificação de cor de rating não documentada na interface

**Problema:** As 8 cores de rating (A=#576558 até H=#F27C7C) são usadas em gráficos de Contratos, PDD e Elegibilidade, mas não há legenda explicando a lógica semântica (verde-oliva = baixo risco, vermelho = alto risco).

**Correção recomendada:**
- Adicionar legenda contextual nos gráficos que usam cores de rating
- Texto: "Escala de risco: A (baixo) a H (alto)" com amostra de cor

---

#### P2-VIS-05: Gráfico de "Rating x Empreendimento" com altura insuficiente

**Problema:** Na `ContratosPage`, aba "Visão Macro", o gráfico "Rating x Empreendimento" usa `height={120}`. Para um bar chart horizontal stacked com múltiplos projetos, 120px é insuficiente para leitura confortável.

**Correção recomendada:** Ajustar para `height={180}` mínimo, ou calcular dinamicamente: `height={Math.max(120, data.length * 50)}`.

---

#### P2-VIS-06: Dados hardcoded na página de Simulação

**Problema:** A tabela de stress test LTV na `SimulacaoPage` usa `ltvStressData` hardcoded (linhas 16-25). Esses dados não são afetados pelos filtros globais nem pela API.

**Correção recomendada:** Migrar para dados dinâmicos via `useSimulacao` hook, ou marcar explicitamente como "Cenário ilustrativo" com nota visual.

---

#### P2-VIS-07: Vários gráficos da Elegibilidade usam dados mock importados diretamente

**Problema:** A `ElegibilidadePage` importa extensivamente de `@/shared/data/mock-data` (12 datasets), mas apenas `ltvFaixa` vem do hook `useElegibilidade`. As demais seções (safra, faixa, matriz, restrições) usam dados estáticos.

**Correção recomendada:** Registrar como dívida técnica. No mínimo, exibir badge "Dados ilustrativos" quando usando mock.

---

### 2.5 LAYOUT E HIERARQUIA VISUAL

#### P1-LAYOUT-01: Página de Fluxo de Caixa com layout side-by-side problemático

**Problema:** O layout `grid gap-6 lg:grid-cols-[300px_1fr]` coloca a tabela em coluna estreita de 300px à esquerda e os gráficos à direita. A tabela com 3 colunas (Mês, Fluxo Esperado, Fluxo Contratado) fica comprimida. Em mobile empilha sem boa hierarquia.

**Evidência:** Princípio de hierarquia visual. Gráficos são a informação primária (overview), tabela é secundária (detalhamento).

**Correção recomendada:**
- Inverter a ordem: gráficos primeiro, tabela abaixo
- Ambos em full-width para maximizar legibilidade
- Manter a tabela colapsável se desejado

---

#### P2-LAYOUT-02: AppBar com user profile pill posicionado antes dos filtros

**Problema:** Na `AppBar`, o user profile pill (foto + nome + email) aparece à esquerda, antes do spacer e filtros. Ocupa espaço horizontal precioso, especialmente em telas médias (1024-1366px). Os filtros ficam comprimidos à direita.

**Evidência:** Princípio de economia de espaço (Tufte). Em dashboards de dados, cada pixel da barra de ferramentas deve priorizar controles analíticos.

**Correção recomendada:**
- Mover o user profile para a sidebar (bottom) ou para um menu dropdown no canto direito
- Liberar espaço horizontal na AppBar para filtros e ações

---

#### P2-LAYOUT-03: Páginas de Anexo sem card wrapper

**Problema:** As páginas de Anexo (Rating, PDD, Elegibilidade) renderizam tabelas e textos diretamente sem card container. As tabelas usam o componente `Table` diretamente, sem o `DataTableWidget` ou `Card` wrapper, criando inconsistência visual com as demais páginas.

**Correção recomendada:**
- Envolver o conteúdo dos Anexos em `Card` components
- Usar `DataTableWidget` para as tabelas dos Anexos para manter consistência de estilo

---

### 2.6 INTERAÇÃO COM IA

#### P1-AI-01: Assistente IA sem contexto dos filtros ativos

**Problema:** A `AISidebar` envia mensagens via `useChat` para `/api/chat` mas não transmite o contexto dos filtros ativos (período, empreendimento) nem a página atual. O assistente responde sem saber qual slice de dados o usuário está visualizando.

**Evidência:** Princípio de relevância contextual. Um assistente que não sabe o que o usuário está olhando precisa de mais perguntas de clarificação.

**Correção recomendada:**
- Enviar metadata no system prompt: período selecionado, empreendimento, página atual
- Ajustar sugestões de perguntas dinamicamente com base na página (e.g., em PDD: "Qual rating tem maior delta?")

---

#### P2-AI-02: Sugestões de perguntas são estáticas

**Problema:** Os `SUGGESTIONS` na `AISidebar` são 4 strings fixas, independente da página ou dados atuais.

**Correção recomendada:**
- Gerar sugestões contextuais: na página de PDD, sugerir "Qual rating tem maior PDD Liquid?"; no Dashboard, "Qual faixa de atraso tem mais contratos?"
- Manter 2 sugestões fixas genéricas + 2 contextuais

---

#### P2-AI-03: Mensagens de tool call sem formatação rica

**Problema:** Quando o assistente executa tools, o output é `"ferramenta concluído"` sem formatação do resultado. Se o LLM retornar tabelas ou números, eles aparecem como texto plano.

**Correção recomendada:**
- Renderizar markdown nas respostas usando `react-markdown`
- Formatar valores monetários e percentuais automaticamente nos outputs de ferramentas

---

### 2.7 MOBILE E RESPONSIVIDADE

#### P1-MOBILE-01: Tabelas com 12+ colunas ilegíveis em mobile

**Problema:** Tabelas como a de Contratos (12 colunas) e Repasse (15 colunas) são renderizadas com `overflow-x-auto`, o que em mobile requer scroll horizontal extenso. A primeira coluna (identificador) sai da tela.

**Correção recomendada:**
- Primeira coluna sticky (`position: sticky; left: 0`)
- Em viewports < 768px, considerar modo card-view (cada linha vira um card empilhável)
- Shadow sutil na borda da coluna sticky para indicar scroll

---

#### P2-MOBILE-02: Gráficos com labels rotacionados -45 graus cortam em tela pequena

**Problema:** Gráficos que usam `angle={-45}` no XAxis (Pagamentos, Simulação, Elegibilidade) podem ter labels cortados em mobile pois o `height` do XAxis não é responsivo.

**Correção recomendada:**
- Em mobile, simplificar labels (e.g., "jan" ao invés de "jan/2024")
- Usar callback `tickFormatter` responsivo que detecta viewport width
- Considerar rotação 0 com intervalos maiores em telas pequenas

---

#### P2-MOBILE-03: GlobalFilters comprimidos na AppBar mobile

**Problema:** Os 3 controles (MonthRangePicker, MultiSelectCombobox, Switch Comparar) ficam apertados na AppBar em mobile. O Switch "Comparar" já está hidden em `sm:flex`, mas MonthRangePicker e MultiSelectCombobox competem por espaço.

**Correção recomendada:**
- Em mobile, consolidar filtros em um botão "Filtros" que abre um sheet/drawer com todos os controles em layout vertical
- Exibir badge de contagem de filtros ativos no botão

---

### 2.8 ESTADOS E FEEDBACK

#### P1-STATE-01: Erro da página Fluxo de Caixa e PDD não mostra fallback de dados

**Problema:** Nas páginas `FluxoDeCaixaPage` e `PddPage`, quando há erro, o bloco de erro é mostrado e o conteúdo é ocultado completamente (pattern `error ? <ErrorMsg> : <Content>`). Nas demais páginas (Dashboard, Contratos, Pagamentos), o erro é mostrado E o conteúdo com dados locais é exibido abaixo.

**Evidência:** Inconsistência no pattern de degradação graciosa.

**Localização:**
- `FluxoDeCaixaPage.tsx` linhas 46-49: `error ? <ErrorMsg> : (...)`
- `PddPage.tsx` linhas 47-50: `error ? <ErrorMsg> : (...)`

**Correção recomendada:**
- Padronizar: erro sempre como banner acima do conteúdo, conteúdo sempre renderizado com dados fallback
- Pattern: `{error && <ErrorBanner />}` + conteúdo normal, nunca `error ? ... : ...`

---

#### P2-STATE-02: Ausência de timestamp de última atualização dos dados

**Problema:** Em nenhuma página há indicação de quando os dados foram atualizados pela última vez. Em uma plataforma de decisão financeira, a frescor dos dados é crítica.

**Correção recomendada:**
- Exibir "Dados de jan. de 2026" ou "Última atualização: 13/03/2026 08:30" na AppBar ou abaixo do título da página
- Obter timestamp do BigQuery response metadata ou do cache TTL

---

#### P2-STATE-03: Loading skeleton do Dashboard KPI tem dimensões fixas que não correspondem ao conteúdo final

**Problema:** O skeleton do KpiCard no Dashboard (linhas 187-193) renderiza blocos `h-4 w-20`, `h-8 w-28`, `h-12 w-full` que não correspondem exatamente às dimensões do conteúdo carregado, causando layout shift quando o loading termina.

**Correção recomendada:** Ajustar dimensões do skeleton para corresponder mais proximamente ao conteúdo real. Usar `animate-pulse` com transição suave ao revelar o conteúdo.

---

### 2.9 OPORTUNIDADES DE DIFERENCIAÇÃO (P3)

#### P3-ENH-01: Atalhos de teclado para power users

Analistas que usam a plataforma diariamente se beneficiariam de:
- `Cmd+K` / `Ctrl+K`: Busca global (páginas, métricas)
- `Cmd+Shift+A`: Abrir/fechar assistente IA
- `Cmd+[`: Colapsar/expandir sidebar
- `1-0`: Navegação rápida entre páginas (1=Dashboard, 2=Contratos, etc.)

Implementação: usar `useEffect` com `keydown` listener global. Exibir dialog de atalhos com `?`.

---

#### P3-ENH-02: Drill-down dos KPIs para páginas relacionadas

O KPI "Inadimplência" no Dashboard deveria ter link para a página de Elegibilidade/Inadimplência. "Valor em Atraso" para a tabela de faixas. "Saldo Devedor" para Contratos. Implementar via prop `href` no KpiCard.

---

#### P3-ENH-03: Comparação visual nos gráficos

Quando toggle "Comparar" ativo, renderizar overlay de período anterior como linha tracejada nos gráficos. Recharts suporta múltiplos datasets no mesmo gráfico com `strokeDasharray`.

---

#### P3-ENH-04: Alertas visuais para métricas em zona crítica

Quando inadimplência ultrapassa threshold (e.g., > 5%), exibir badge pulsante no KPI, borda vermelha no card e notificação no ícone `Bell` da AppBar. Thresholds configuráveis por cliente.

---

#### P3-ENH-05: Favoritos/pinning de KPIs

Permitir que o usuário reordene KPIs no Dashboard com drag-and-drop ou estrela de favorito. Persistir preferência no localStorage ou Firebase.

---

#### P3-ENH-06: Indicador de "data freshness" com semáforo

Exibir dot verde/amarelo/vermelho ao lado do timestamp de atualização:
- Verde: dados do dia atual
- Amarelo: dados de ontem ou D-2
- Vermelho: dados com mais de 3 dias

---

#### P3-ENH-07: Modo de impressão / exportação de dashboard

Botão "Exportar PDF" que gera snapshot do dashboard atual com charts renderizados como imagens. Útil para reports regulatórios e apresentações a investidores.

---

#### P3-ENH-08: Light mode para apresentações e impressões

Embora dark mode seja primário, oferecer light mode toggle para uso em projeções e materiais impressos. Mapear todas as custom properties OKLCH para variantes light.

---

## 3. Priorização de Implementação

### Sprint 3 — Consistência e Acessibilidade (2-3 semanas)

| ID | Descrição | Esforço | Impacto |
|----|----------|---------|---------|
| P0-COMP-01 | Unificar componentes KpiCard | Alto | Alto |
| P0-COMP-02 | Paginação nas tabelas (TanStack) | Médio | Alto |
| P0-COMP-03 | Eixo X com datas reais nos gráficos | Médio | Alto |
| P1-ACESS-01 | Corrigir contrastes WCAG AA | Médio | Alto |
| P1-STATE-01 | Padronizar pattern de erro + fallback | Baixo | Médio |
| P1-COMP-06 | Column visibility + sticky column em tabelas largas | Médio | Alto |
| P1-VIS-01 | Gráficos na página PDD | Médio | Alto |

### Sprint 4 — Interação e Feedback (2-3 semanas)

| ID | Descrição | Esforço | Impacto |
|----|----------|---------|---------|
| P1-COMP-04 | Feedback de filtros ativos + "Limpar" | Médio | Médio |
| P1-COMP-05 | Desabilitar/esconder toggle Comparar se sem funcionalidade | Baixo | Médio |
| P1-NAV-01 | Renomear Elegibilidade → Inadimplência na nav | Baixo | Alto |
| P1-NAV-02 | Anexos visíveis no modo collapsed da sidebar | Médio | Baixo |
| P1-ACESS-02 | aria-label em todos os gráficos | Médio | Alto |
| P1-AI-01 | Contexto dos filtros no chat IA | Médio | Médio |
| P1-MOBILE-01 | Sticky first column em tabelas mobile | Médio | Alto |

### Sprint 5 — Polish e Enhancements (3-4 semanas)

| ID | Descrição | Esforço | Impacto |
|----|----------|---------|---------|
| P1-VIS-02 | Labels de eixo X formatados em gráficos de Pagamentos | Baixo | Médio |
| P1-VIS-03 | Tooltip percentual em gráficos expand stacked | Baixo | Médio |
| P1-LAYOUT-01 | Reorganizar layout Fluxo de Caixa | Baixo | Baixo |
| P2-COMP-07 | Exportação CSV em todas as tabelas | Médio | Médio |
| P2-ACESS-03 | Área de toque da sidebar | Baixo | Baixo |
| P2-ACESS-04 | Padrões/texturas em gráficos além de cor | Alto | Médio |
| P2-AI-02 | Sugestões contextuais no chat IA | Médio | Médio |
| P2-STATE-02 | Timestamp de atualização dos dados | Baixo | Médio |
| P2-NAV-03 | Label dinâmico no botão "Mais" mobile | Médio | Baixo |
| P2-NAV-04 | Breadcrumbs em Anexos | Baixo | Baixo |
| P2-LAYOUT-02 | Mover user profile para sidebar | Médio | Baixo |
| P2-LAYOUT-03 | Card wrapper nos Anexos | Baixo | Baixo |
| P2-VIS-04 | Legenda de cor de rating | Baixo | Baixo |
| P2-VIS-05 | Altura do gráfico Rating x Empreendimento | Baixo | Baixo |
| P2-MOBILE-02 | Labels responsivos em gráficos | Médio | Médio |
| P2-MOBILE-03 | Filtros em drawer no mobile | Médio | Médio |

### Sprint 6+ — Diferenciação Competitiva (contínuo)

Todos os itens P3-ENH (atalhos de teclado, drill-down, comparação visual, alertas, favoritos, light mode, exportação PDF).

---

## 4. Lacunas em Relação ao Plano v1.0

| Item do Plano v1.0 | Status | Nota |
|---------------------|--------|------|
| P0-TERM-01: Acentuação | Implementado | Verificado no código |
| P0-TERM-02: Tooltip PDD na nav | Parcialmente | Glossário existe, mas nav tooltip não verificado |
| P0-DESC-01: Subtítulos em todas as páginas | Implementado | Todos os h2 têm subtítulo |
| P0-DESC-02: Eixo X genérico | **Pendente** | Re-classificado como P0-COMP-03 neste plano |
| P0-COMP-01: Unificação KpiCard | **Pendente** | Re-classificado como P0-COMP-01 |
| P1-NAV-01: Elegibilidade vs Inadimplência | **Pendente** | Re-classificado como P1-NAV-01 |
| P1-NAV-02: Agrupamento de nav | Implementado | CARTEIRA, RISCO, OPERACIONAL |
| P1-NAV-03: Cor azul BottomTabBar | Implementado | Verificado: usa `#F3A169` |
| P1-TERM-03: Tooltips termos técnicos | Implementado | InfoTooltip + glossary.ts |
| P1-TERM-04: Padronizar "Faixa de Atraso" | Implementado | Consistente no código |
| P1-TERM-05: "ID Contrato" → "Contratos" | Parcialmente | PDD usa "Qtd. Contratos", Dashboard usa "Contratos" |
| P1-ACESS-01: Contrastes WCAG | **Pendente** | Vários valores < 4.5:1 permanecem |
| P1-COMP-02: Paginação tabelas | **Pendente** | Re-classificado como P0-COMP-02 |
| P1-COMP-03: Feedback filtros | **Pendente** | Re-classificado como P1-COMP-04 |
| P1-COMP-04: .slice(0,8) Fluxo de Caixa | Implementado | Slice removido no código atual |
| P1-DESC-03: Subtítulos em gráficos | Implementado | Todos os ChartWidget têm subtitle |
| P1-VIS-01: Gráficos na PDD | **Pendente** | Re-classificado como P1-VIS-01 |
| P1-VIS-02: Padronizar títulos de página | Implementado | Pattern h2 + subtitle uniforme |
| P1-STATE-01: Mensagens de erro | Implementado | Sem detalhes técnicos |
| P2-TERM-06: R$ no formatCurrency | Implementado | Verificado: "R$ 443,4 mi" |
| P2-NAV-04: Ícones nos Anexos | Implementado | BookOpen, Shield, FileCheck |
| P2-NAV-05: Títulos específicos Anexos | Implementado | "Anexo: Rating Liquid" etc. |
| P2-COMP-05: Exportação CSV global | **Pendente** | Apenas Detalhamento tem |
| P2-COMP-06: Visibilidade colunas | **Pendente** | Nenhuma implementação |
| P2-COMP-07: Header duplicado AnexosElegibilidade | Verificar | Código atual mostra "Prazo Decorrido" e "Prazo Remanescente" como distintos |
| P2-STATE-02: Toggle Comparar sem contexto | **Pendente** | Toggle existe sem funcionalidade |
| P2-ACESS-02: aria-label gráficos | **Pendente** | Nenhum gráfico tem |
| P2-VIS-03: Layout Fluxo de Caixa | Parcialmente | Ainda side-by-side |

---

## 5. Checklist de Acessibilidade Atualizado (WCAG 2.1 AA)

- [ ] Todos os textos com ratio de contraste >= 4.5:1 (texto normal) ou >= 3:1 (texto grande)
- [ ] Todos os gráficos com `role="img"` e `aria-label` descritivo
- [ ] Todos os botões com `aria-label` quando sem texto visível
- [ ] Navegação por teclado funcional em tabelas, modais e sidebar
- [ ] Focus visible em todos os elementos interativos (já presente no NavItem)
- [ ] Tabelas com headers semânticos (TanStack Table gera `<th>`)
- [ ] Formulários com labels associados (textarea do chat IA precisa label)
- [ ] Animações respeitam `prefers-reduced-motion` (implementado em globals.css)
- [ ] Cores não são único meio de transmitir informação em gráficos
- [ ] Alvos de toque >= 44x44px em mobile (BottomTabBar ok, sidebar collapse não)
- [ ] Contraste em bordas interativas >= 3:1 (verificar `border-white/[0.06]`)

---

## 6. Métricas de Sucesso

| Métrica | Baseline Estimado | Target pós-Sprint 5 |
|---------|------------------|---------------------|
| Tempo para localizar métrica específica | ~12s | <6s |
| Erros de interpretação em teste de usabilidade | 2-3 por sessão | <1 por sessão |
| SUS Score (System Usability Scale) | ~72 | >82 |
| Taxa de conclusão de tarefa | ~82% | >92% |
| WCAG AA compliance rate | ~60% | >95% |
| Lighthouse Accessibility score | ~75 | >90 |

---

## 7. Componentes a Criar/Modificar

### 7.1 KpiCard Unificado (modificação)
- Arquivo: `src/widgets/kpi-grid/ui/KpiCard.tsx`
- Absorver o KpiCard inline do `DashboardPage.tsx`
- Props: `variant="rich" | "compact"`, `icon`, `sparklineData`, `onExpand`, `comparison`

### 7.2 DataTableWidget v2 (modificação)
- Arquivo: `src/widgets/data-table-widget/ui/DataTableWidget.tsx`
- Novas props: `exportable`, `pageSize`, `columnVisibility`, `stickyFirstColumn`
- Paginação: `getPaginationRowModel()` do TanStack Table

### 7.3 FilterContextBar (novo)
- Arquivo: `src/widgets/filter-context-bar/ui/FilterContextBar.tsx`
- Barra fina abaixo da AppBar com resumo dos filtros ativos e botão "Limpar"

### 7.4 ChartWidget v2 (modificação)
- Arquivo: `src/widgets/chart-widget/ui/ChartWidget.tsx`
- Nova prop: `ariaLabel` para acessibilidade dos gráficos

### 7.5 PageHeader (novo, opcional)
- Arquivo: `src/widgets/page-header/ui/PageHeader.tsx`
- Props: `title`, `subtitle`, `breadcrumbs?`, `actions?`, `lastUpdated?`
- Padroniza header de todas as páginas

---

*Documento gerado em 13/03/2026. Próxima revisão planejada após conclusão do Sprint 3.*
