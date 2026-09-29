# Liquid DataViz -- Plano de Melhorias de UX

**Versao:** 1.0
**Data:** 13 de marco de 2026
**Autor:** Analise de UX Especializada
**Escopo:** Todas as paginas, widgets e fluxos de navegacao da plataforma

---

## Sumario Executivo

Este documento apresenta uma analise completa de usabilidade da plataforma Liquid DataViz, um dashboard de business intelligence para carteiras de credito imobiliario securitizadas. A analise abrange 13 paginas, 10 widgets reutilizaveis, o sistema de navegacao e os padroes de interacao, com foco nos usuarios-alvo: gestores de fundos, analistas de credito e equipes de securitizacao.

A plataforma ja possui uma base solida: dark theme coerente, arquitetura Feature-Sliced Design bem organizada, componentes reutilizaveis (ChartWidget, DataTableWidget, KpiCard) e responsividade mobile com bottom tab bar. As melhorias propostas aqui visam elevar a experiencia de um nivel funcional para um nivel de excelencia analitica.

---

## 1. Diagnostico da Situacao Atual

### 1.1 Pontos Fortes Existentes

- **Hierarquia visual dos KPIs no Dashboard:** Cards com sparklines, badges de variacao e modais expandidos demonstram bom design de progressive disclosure.
- **Paleta de cores semantica para risco:** Gradiente olive-to-orange nas faixas de atraso cria leitura intuitiva de risco crescente.
- **Empty states e loading states:** Implementados com skeletons em todas as paginas, bom padrao de feedback visual.
- **Responsividade mobile:** Bottom tab bar com menu "Mais" e sidebars em sheet demonstram boa adaptacao.
- **Assistente IA integrado:** Chips de sugestao, streaming de respostas, layout conversacional adequado.

### 1.2 Panorama de Problemas Identificados

| Severidade | Quantidade | Impacto |
|-----------|-----------|---------|
| P0 (Critico) | 4 | Bloqueiam interpretacao correta de dados ou completam tarefas |
| P1 (Major) | 11 | Degradam significativamente eficiencia ou causam erros frequentes |
| P2 (Minor) | 14 | Subotimo mas funcional; melhorias enriqueceriam a experiencia |
| P3 (Enhancement) | 8 | Oportunidades de diferenciacao competitiva |

---

## 2. Problemas Identificados por Categoria

### 2.1 TERMINOLOGIA E MICROCOPY

#### P0-TERM-01: Ausencia de acentuacao em toda a interface

**Problema:** Todos os textos da interface usam caracteres sem acento -- "Visao Geral", "Inadimplencia", "Simulacao", "Elegibilidade", "Evolucao", "Restricao", "Provisao de Credito de Liquidacao Duvidosa". Isso ocorre em titulos, labels de KPIs, headers de tabelas, labels de navegacao e ate no titulo da SheetTitle do menu.

**Evidencia:** Heuristica de Nielsen #2 (correspondencia entre sistema e mundo real). O publico-alvo -- gestores financeiros e analistas de credito -- opera em ambiente formal e regulado. Textos sem acentuacao transmitem falta de polimento profissional e podem gerar desconfianca em um produto que manipula dados financeiros criticos.

**Impacto:** Compromete a percepcao de credibilidade da plataforma. Em apresentacoes a investidores ou auditorias, screenshots com textos sem acento enfraquecem a marca.

**Localizacao:** Todas as paginas, navegacao (constants.ts), KPI labels (DashboardPage), headers de tabelas, titulos de graficos, e textos de contexto.

**Correcao recomendada:**

Arquivos e textos afetados (lista parcial das correcoes mais visiveis):

| Local | Atual | Proposto |
|-------|-------|----------|
| constants.ts NAV_ITEMS | `Visao Geral` | `Visao Geral` -> `Visao Geral` (com til) |
| constants.ts NAV_ITEMS | `Simulacao` | `Simulacao` -> usar a forma acentuada |
| DashboardPage h1 | `Visao Geral` | `Visao Geral` (acentuado) |
| DashboardPage KPI | `Inadimplencia` | `Inadimplencia` (acentuado) |
| DashboardPage KPI | `Over 90 dias` | `Over 90 dias` (acentuado) |
| DashboardPage chart | `Evolucao do Saldo Devedor` | Acentuar |
| PddPage | `Provisao de Credito de Liquidacao Duvidosa` | Acentuar |
| Todas as tabelas | Headers como `Inadimplencia %`, `Restricao`, `Correcao Monetaria` | Acentuar todos |
| GlobalFilters switch | `Comparar` label e aria-label `Comparar periodos` | Acentuar `periodos` |
| EmptyState | `Nao ha dados...` | Acentuar |
| NavSidebar SheetTitle | `Menu de navegacao` | `Menu de navegacao` (acentuado) |

**Nota tecnica:** Todos os arquivos .tsx ja suportam UTF-8. E uma questao puramente de conteudo textual, nao requer mudancas de infraestrutura.

---

#### P0-TERM-02: Sigla "PDD" sem contextualizacao acessivel

**Problema:** A sigla "PDD" aparece como label de navegacao, titulo de pagina e header de tabela sem nenhum tooltip ou texto de apoio visivel ao primeiro contato. O subtitulo "Provisao de Credito de Liquidacao Duvidosa" so aparece DENTRO da pagina PDD, nao na navegacao.

**Evidencia:** Principio de reconhecimento sobre recordacao (Nielsen #6). Mesmo analistas experientes podem nao associar imediatamente "PDD" a "Provisao para Devedores Duvidosos" quando estao navegando rapidamente.

**Impacto:** Usuarios menos experientes (novos analistas, gestores que estao conhecendo a plataforma) podem hesitar antes de clicar, aumentando tempo de navegacao.

**Localizacao:** NavSidebar, BottomTabBar (MORE_ITEMS), AppBar title.

**Correcao recomendada:**
- Adicionar tooltip no NavItem quando hovering: "PDD - Provisao para Devedores Duvidosos"
- No BottomTabBar MORE_ITEMS, exibir "PDD (Provisao)" como label curto
- Manter "PDD" como label principal para usuarios recorrentes (economia de espaco)

---

#### P1-TERM-03: Termos tecnicos sem tooltips explicativos

**Problema:** Varios termos financeiros especializados aparecem sem nenhuma explicacao contextual:
- **LTV** (Loan-to-Value) -- usado em KPIs, headers de tabela, titulos de graficos
- **Over 90** -- jargao de credito para contratos com mais de 90 dias de atraso
- **Pro-Soluto** -- termo juridico na pagina de Repasse
- **Delta PDD** -- diferenca entre provisoes
- **Rating Liquid** vs **Rating Bacen** -- duas escalas diferentes
- **Desagio** -- percentual de desconto na precificacao
- **Safra** -- periodo de originacao dos contratos
- **Elegibilidade** vs **Elegibilidade Futura** vs **Elegibilidade Possivel**

**Evidencia:** Teoria da Carga Cognitiva (Sweller). Termos tecnicos sem contexto aumentam a carga cognitiva extrinseca, desviando atencao do que importa: interpretar os dados.

**Impacto:** Analistas juniores, gestores em onboarding e stakeholders nao-tecnicos (conselheiros, investidores em demonstracao) terao dificuldade de compreensao.

**Localizacao:** Todas as paginas que usam esses termos.

**Correcao recomendada:**
Implementar sistema de tooltips informativos com icone de informacao (Lucide `Info` icon, 14px) ao lado dos termos tecnicos.

Textos sugeridos para tooltips:

| Termo | Texto do Tooltip |
|-------|-----------------|
| LTV | Loan-to-Value: razao entre o saldo devedor e o valor do imovel. Quanto maior, maior o risco de credito. |
| Over 90 | Percentual de contratos com atraso superior a 90 dias. Indicador critico de inadimplencia. |
| PDD | Provisao para Devedores Duvidosos: estimativa contabil de perda esperada na carteira. |
| Pro-Soluto | Operacao em que o cessionario assume o risco de inadimplencia do devedor. |
| Delta PDD | Diferenca entre a PDD minima exigida pelo Bacen e a PDD calculada pelo modelo Liquid. |
| Rating Liquid | Classificacao de risco proprietaria da Liquid, de A (baixo risco) a H (default). |
| Desagio | Percentual de desconto aplicado sobre o valor nominal na precificacao da carteira. |
| Safra | Periodo (mes/ano) em que o contrato foi originado. |
| Elegibilidade | Classificacao que indica se o contrato atende aos criterios para securitizacao ou repasse bancario. |
| Saldo Nominal | Valor total contratado, antes de ajustes e correcao monetaria. |
| Saldo Devedor | Valor atualizado da divida, considerando pagamentos realizados e correcao monetaria. |
| Inadimplencia % | Razao entre o valor em atraso e o saldo devedor total da carteira. |

**Implementacao tecnica:** Criar componente `<InfoTooltip term="LTV" />` usando Radix UI `Tooltip` primitivo. Centralizar os textos em um arquivo `shared/config/glossary.ts`.

---

#### P1-TERM-04: Inconsistencia terminologica "Faixa Atraso" vs "Faixa de Atraso" vs "Dias de Atraso"

**Problema:** O mesmo conceito e referenciado com tres formas diferentes:
- Header de tabela: `Faixa Atraso` (sem preposicao)
- Titulo de grafico: `Contratos por Faixa de Atraso` (com preposicao)
- Titulo de secao: `Indicadores por Faixa de Atraso`
- Anexo PDD: `Dias de Atraso`

**Evidencia:** Heuristica de Nielsen #4 (consistencia e padroes). Inconsistencia terminologica obriga o usuario a processar cognitivamente se sao conceitos diferentes ou iguais.

**Correcao recomendada:** Padronizar como `Faixa de Atraso` em todos os contextos (exceto quando se referir especificamente a "dias de atraso" em contexto numerico).

---

#### P1-TERM-05: Label "ID Contrato" ambiguo na tabela de PDD

**Problema:** Na pagina PDD, a coluna `ID Contrato` na verdade exibe a QUANTIDADE de contratos por rating, nao um identificador individual. A mesma ambiguidade ocorre no Dashboard (coluna `ID Contrato` na tabela de faixas).

**Evidencia:** Heuristica de Nielsen #2 (correspondencia sistema-mundo real). "ID" universalmente sugere um identificador unico, nao uma contagem.

**Impacto:** Analistas podem interpretar erroneamente os dados, pensando que se trata de um contrato especifico.

**Correcao recomendada:** Renomear para `Qtd. Contratos` ou `Contratos` em todas as tabelas onde o campo representa quantidade.

---

#### P2-TERM-06: Formato de moeda sem simbolo R$

**Problema:** A funcao `formatCurrency` exibe valores como "443,4 mi" e "2,17 mil" sem o simbolo "R$". Em uma plataforma financeira, a ausencia do simbolo monetario pode gerar ambiguidade, especialmente se houver contratos indexados a moedas estrangeiras no futuro.

**Evidencia:** Convencoes do dominio financeiro brasileiro. Relatorios CVM e documentos regulatorios sempre precedem valores com R$.

**Correcao recomendada:** Alterar `formatCurrency` para incluir o prefixo `R$`:
- Atual: `443,4 mi`
- Proposto: `R$ 443,4 mi`

---

### 2.2 NAVEGACAO E ARQUITETURA DE INFORMACAO

#### P1-NAV-01: Pagina de Elegibilidade rotulada como "Elegibilidade" mas contem "Analise de Inadimplencia"

**Problema:** O item de navegacao diz "Elegibilidade", o titulo na AppBar diz "Elegibilidade", mas o h2 dentro da pagina diz "Analise de Inadimplencia". O conteudo real inclui 5 abas: LTV, Safra, Faixa de Atraso, Matriz Cobranca, Restricoes. Apenas a aba LTV tem relacao direta com elegibilidade.

**Evidencia:** Heuristica de Nielsen #2 (correspondencia) e principio de "information scent" (Spool). Quando o label de navegacao nao corresponde ao conteudo, o usuario perde confianca na estrutura informacional.

**Impacto:** Usuarios buscando criterios de elegibilidade vao a esta pagina e encontram analise de inadimplencia. Usuarios buscando analise de inadimplencia nao pensariam em clicar em "Elegibilidade".

**Correcao recomendada:**
- Opcao A (Recomendada): Separar em duas paginas -- "Inadimplencia" (LTV, Safra, Faixa, Matriz) e "Elegibilidade" (criterios de elegibilidade integrados do Anexo)
- Opcao B: Renomear para "Inadimplencia e Elegibilidade" na navegacao e usar o titulo "Analise de Risco e Elegibilidade" na pagina

---

#### P1-NAV-02: Hierarquia flat com 10 itens no menu principal

**Problema:** O menu lateral exibe 10 itens de navegacao em lista flat sem agrupamento logico: Visao Geral, Contratos, Pagamentos, Fluxo de Caixa, PDD, Pricing, Simulacao, Elegibilidade, Repasse, Detalhamento. Adicionalmente, ha 3 itens em "Anexos".

**Evidencia:** Regra de Miller (7 +/- 2 itens para processamento cognitivo). Com 10 itens, o usuario precisa scanear toda a lista para encontrar o que precisa. Alem disso, nao ha agrupamento semantico que facilite a localizacao.

**Impacto:** Tempo de navegacao aumentado, especialmente para novos usuarios ou em demonstracoes comerciais.

**Correcao recomendada:** Agrupar os itens em categorias semanticas com separadores visuais e labels de secao:

```
CARTEIRA
  Visao Geral
  Contratos
  Pagamentos
  Fluxo de Caixa

RISCO E PRICING
  PDD
  Pricing
  Simulacao

OPERACIONAL
  Elegibilidade / Inadimplencia
  Repasse
  Detalhamento

ANEXOS
  Rating Liquid
  PDD
  Elegibilidade
```

Implementacao: Adicionar propriedade `group` aos NAV_ITEMS e renderizar separadores `<div className="h-px bg-white/[0.06] mx-4 my-2" />` com labels `<span className="text-[10px] uppercase tracking-widest text-white/20 px-3">Carteira</span>` entre os grupos.

---

#### P1-NAV-03: Bottom tab bar mobile usa cor azul (#7CB4F2) desalinhada do design system

**Problema:** A BottomTabBar e seu menu "Mais" usam a cor `#7CB4F2` (azul) para itens ativos, enquanto todo o resto da plataforma usa `#F3A169` (orange) como cor de destaque. Isso cria dissonancia visual e quebra a identidade da marca.

**Evidencia:** Principio de Gestalt de similaridade. Elementos com a mesma funcao (indicacao de estado ativo) devem compartilhar a mesma codificacao visual.

**Localizacao:** `src/widgets/bottom-tab-bar/ui/BottomTabBar.tsx`, classes com `text-[#7CB4F2]`, `bg-[#7CB4F2]/10`, `border-[#7CB4F2]/15`.

**Correcao recomendada:** Substituir `#7CB4F2` por `#F3A169` em todos os estados ativos da BottomTabBar.

---

#### P2-NAV-04: Anexos sem icones e com hierarquia visual debil

**Problema:** Os itens de Anexos nao possuem icones (diferente dos NAV_ITEMS principais) e o label "ANEXOS" usa texto com opacidade extremamente baixa (`text-white/25`), tornando a secao quase invisivel.

**Correcao recomendada:**
- Adicionar icones aos ANEXO_ITEMS (BookOpen, Shield, FileCheck)
- Aumentar opacidade do label de secao para `text-white/35`
- Manter o estado colapsavel mas iniciar expandido por padrao

---

#### P2-NAV-05: Paginas de Anexo com titulo generico "Anexo" na AppBar

**Problema:** As tres paginas de anexo (Rating, PDD, Elegibilidade) todas exibem `title="Anexo"` na AppBar. Quando o usuario esta em uma delas, nao consegue identificar qual anexo esta visualizando pelo header.

**Correcao recomendada:**
- AnexosRatingPage: `title="Anexo: Rating Liquid"`
- AnexosPddPage: `title="Anexo: PDD"`
- AnexosElegibilidadePage: `title="Anexo: Elegibilidade"`

---

### 2.3 DESCRICOES, TITULOS E CONTEXTO

#### P0-DESC-01: Ausencia de descricoes nas paginas secundarias

**Problema:** Enquanto o Dashboard tem subtitulo "Resumo da carteira securitizada" e a pagina de Detalhamento tem "Visualizacao detalhada de todos os contratos da carteira", a maioria das paginas nao possui NENHUMA descricao contextual:

| Pagina | Titulo | Descricao/Subtitulo |
|--------|--------|-------------------|
| Contratos | Resumo Empreendimentos | Nenhuma |
| Pagamentos | Evolucao dos Pagamentos | Nenhuma |
| Fluxo de Caixa | Fluxo de Caixa Ajustado ao Risco | Nenhuma |
| PDD | PDD + Provisao de Credito... | Texto tecnico mas sem orientacao de uso |
| Pricing | Pricing da Carteira | Nenhuma |
| Simulacao | Simulacao em Bancos | Nenhuma |
| Elegibilidade | Analise de Inadimplencia | Nenhuma |
| Repasse | Grupos Estrategia de Repasse vs Renda vs Pro-Soluto | Nenhuma |

**Evidencia:** Principio de orientacao do usuario (Nielsen #1, visibilidade do estado do sistema). Descricoes de pagina ajudam o usuario a confirmar que esta no lugar certo e a entender o que pode fazer ali.

**Impacto:** Usuarios novos nao tem orientacao sobre o proposito de cada pagina. Em demonstracoes comerciais, o apresentador precisa explicar verbalmente cada tela.

**Correcao recomendada:** Adicionar subtitulos descritivos abaixo de cada h2:

| Pagina | Subtitulo Proposto |
|--------|-------------------|
| Dashboard | Resumo consolidado da carteira securitizada com indicadores-chave e tendencias |
| Contratos | Visao por empreendimento: metricas de risco, unidades e distribuicao de rating |
| Pagamentos | Historico e composicao dos recebimentos da carteira |
| Fluxo de Caixa | Projecao de recebiveis com ajuste de risco de credito |
| PDD | Provisao para devedores duvidosos por rating -- modelo Liquid vs. minimo Bacen |
| Pricing | Precificacao da carteira com desagio por rating e elegibilidade |
| Simulacao | Stress test de LTV em cenarios de repasse bancario |
| Elegibilidade | Analise de inadimplencia por LTV, safra, faixa de atraso e restricoes |
| Repasse | Grupos de estrategia por renda, restricao e viabilidade de repasse |
| Detalhamento | Base analitica contrato a contrato com exportacao completa |

**Implementacao:** Padronizar com `<p className="mt-2 text-sm text-white/40 max-w-2xl">{subtitulo}</p>` abaixo de cada titulo principal.

---

#### P0-DESC-02: Grafico "Evolucao do Saldo Devedor" no Dashboard sem eixo X legivel

**Problema:** O eixo X do grafico de evolucao no Dashboard exibe `M1`, `M2`, `M3`... que sao labels genericos sem significado temporal. O usuario nao consegue identificar a qual mes/ano cada ponto se refere.

**Evidencia:** Principio de data-ink ratio (Tufte). O eixo deve comunicar informacao, nao apenas marcar posicao. Edward Tufte argumenta que cada pixel de tinta deve transmitir dados uteis.

**Impacto:** Impossibilita correlacionar eventos de mercado (ex: aumento de Selic) com movimentos no grafico. Decisoes baseadas em tendencias temporais ficam comprometidas.

**Localizacao:** `DashboardPage.tsx`, funcao `EvolutionChart`, XAxis `tickFormatter={(v) => \`M${v + 1}\`}`.

**Correcao recomendada:** Substituir por labels temporais reais (ex: "jan/24", "fev/24"). Isso requer que o hook `useKpiHistory` retorne datas associadas aos valores, nao apenas arrays numericos.

---

#### P1-DESC-03: Graficos sem subtitulos explicativos sobre a metrica

**Problema:** Os ChartWidgets usam apenas `title` sem `subtitle` na maioria dos casos. Exemplos:
- "Saldo Devedor por Grupo" -- qual metrica no eixo Y? Absoluto ou percentual?
- "LTV Banco - Saldo Devedor / Valor do contrato atualizado" -- titulo excessivamente longo que tenta compensar falta de descricao
- "Faixas de Restricoes" -- restricoes de que? Valor? Quantidade?

**Correcao recomendada:** Usar o `subtitle` prop ja disponivel no ChartWidget para dar contexto:

| Grafico | Subtitle Proposto |
|---------|------------------|
| Evolucao do Saldo Devedor | Valor total da divida ao longo do tempo |
| Contratos por Faixa de Atraso | Quantidade de contratos por dias de atraso |
| Composicao dos Pagamentos | Distribuicao percentual por tipo de recebimento |
| Fluxo de Parcela Ajustado ao Risco | Projecao de recebiveis com desconto de PDD |
| LTV Banco | Distribuicao do saldo devedor por faixa de Loan-to-Value |

---

#### P1-DESC-04: Tabela de stress test com dados hardcoded e sem contexto

**Problema:** Na pagina de Simulacao, a tabela "LTV x LTV Stress (10%)" usa dados hardcoded (`ltvStressData`) e nao explica o que significa "Stress 10%". O titulo da tabela tambem e críptico para nao-especialistas.

**Correcao recomendada:**
- Adicionar nota explicativa: "Simulacao do impacto de uma desvalorizacao de 10% nos imoveis sobre as faixas de LTV"
- Marcar visualmente as celulas com LTV > 80% (zona de risco) com background `bg-[#F27C7C]/10`

---

### 2.4 COMPONENTES E PADROES DE INTERACAO

#### P0-COMP-01: KpiCards do Dashboard (inline) vs KpiCards do widget divergem em design

**Problema:** Existem DOIS componentes KpiCard completamente diferentes:
1. **Dashboard KpiCard** (inline em `DashboardPage.tsx`): cards com icones, sparklines em AreaChart, badges de variacao coloridos, botao de expansao
2. **Widget KpiCard** (`kpi-grid/ui/KpiCard.tsx`): cards sem icone, com gradient text, mini bar chart, sem botao de expansao

Eles nao compartilham API, visual ou comportamento. Paginas como Pricing, Simulacao, Elegibilidade e Repasse usam o widget KpiCard, que e visualmente inferior ao do Dashboard.

**Evidencia:** Heuristica de Nielsen #4 (consistencia). O usuario espera que KPIs se comportem da mesma forma em toda a plataforma.

**Impacto:** Experiencia fragmentada. Usuarios que se habituaram aos KPIs ricos do Dashboard encontram KPIs "pobres" nas demais paginas.

**Correcao recomendada:** Unificar em um unico componente KpiCard com variantes:
- `variant="full"`: icone + sparkline + badge + expansao (Dashboard)
- `variant="compact"`: valor + label + trend badge (paginas secundarias)
- Ambos devem compartilhar o mesmo container visual (border gradient, background)

---

#### P1-COMP-02: Tabelas sem paginacao

**Problema:** O DataTableWidget nao implementa paginacao. Em paginas como Detalhamento (que pode ter centenas de contratos) e Elegibilidade (multiplas tabelas), todas as linhas sao renderizadas de uma vez.

**Evidencia:** Principio de performance percebida e carga cognitiva. Tabelas longas sem paginacao degradam a performance de renderizacao e sobrecarregam visualmente.

**Impacto:** Pagina de Detalhamento com 500+ contratos tera scroll infinito e possivel degradacao de performance.

**Correcao recomendada:**
- Adicionar paginacao ao DataTableWidget (10/25/50 linhas por pagina)
- Usar `getPaginationRowModel()` ja disponivel no TanStack Table
- Exibir contagem total: "Mostrando 1-25 de 278 contratos"

---

#### P1-COMP-03: Filtros globais sem feedback de estado aplicado

**Problema:** Os GlobalFilters (MonthRangePicker + MultiSelectCombobox + Switch de comparacao) nao exibem indicacao visual clara de que filtros estao ativos. Se o usuario selecionar um empreendimento especifico, nao ha badge ou indicador de "filtro ativo" na interface.

**Evidencia:** Heuristica de Nielsen #1 (visibilidade do estado do sistema). O usuario deve saber a todo momento quais filtros estao influenciando os dados exibidos.

**Correcao recomendada:**
- Exibir badge de contagem no seletor de empreendimento quando filtros estao ativos (ex: "3 selecionados")
- Adicionar botao "Limpar filtros" quando qualquer filtro estiver ativo
- Exibir barra de contexto abaixo da AppBar: "Exibindo dados de jan/2025 a jan/2026 | Empreendimento: VIVA PARK"

---

#### P1-COMP-04: Pagina de Fluxo de Caixa com tabela truncada a 8 linhas

**Problema:** Em `FluxoDeCaixaPage.tsx`, a tabela e renderizada com `.slice(0, 8)`, descartando silenciosamente dados apos a 8a linha sem nenhuma indicacao ao usuario.

**Evidencia:** Heuristica de Nielsen #1 (visibilidade). Ocultar dados sem aviso e uma violacao grave de transparencia.

**Localizacao:** Linha 48: `data={(fluxoData ?? []).slice(0, 8)}`

**Correcao recomendada:** Remover o `.slice(0, 8)` e implementar paginacao, ou exibir todas as linhas com scroll vertical dentro do card.

---

#### P2-COMP-05: Botao de exportacao CSV apenas no Detalhamento

**Problema:** Apenas a pagina de Detalhamento oferece exportacao CSV. Usuarios de paginas como PDD, Pricing e Repasse tambem precisam exportar dados para relatorios externos (CVM, auditorias, comites).

**Correcao recomendada:** Adicionar botao de exportacao ao DataTableWidget como prop opcional `exportable?: boolean`. Quando ativo, exibir botao "Exportar CSV" no header do card da tabela.

---

#### P2-COMP-06: Tabela de Contratos (Resumo Empreendimentos) com 12 colunas

**Problema:** A tabela de resumo na pagina Contratos tem 12 colunas (Projeto, Total Contratos, Contratos com Atraso, Valor Atraso, Saldo Devedor, Inadimplencia %, Valor Over 90, Contratos Restricao, Valor Imovel, LTV, Pricing, Prazo Remanescente). Isso causa overflow horizontal em qualquer tela.

**Evidencia:** Limitacao do campo visual e principio de Few sobre tabelas analiticas. Tabelas com mais de 7-8 colunas requerem scroll horizontal, que e uma interacao de alto custo.

**Correcao recomendada:**
- Agrupar colunas em categorias com sticky first column (Projeto)
- Alternativa: usar progressive disclosure -- mostrar 6 colunas-chave e botao "Ver todas as colunas"
- Implementar `columnVisibility` do TanStack Table com dropdown de selecao

---

#### P2-COMP-07: Header de tabela duplicado em AnexosElegibilidade

**Problema:** A tabela de criterios de elegibilidade tem duas colunas com o header identico "Prazo Decorrido" (linhas 87-88 do AnexosElegibilidadePage.tsx). Uma deveria ser "Prazo Remanescente".

**Localizacao:** `AnexosElegibilidadePage.tsx`, linhas 87-88.

**Correcao recomendada:** Corrigir a segunda coluna para "Prazo Remanescente".

---

### 2.5 ACESSIBILIDADE

#### P1-ACESS-01: Textos com opacidade abaixo do minimo WCAG AA

**Problema:** Varios elementos de texto usam opacidades extremamente baixas sobre fundo preto:
- Labels de KPIs: `text-white/45` (opacidade 45%)
- Subtitulos: `text-white/30` (opacidade 30%)
- Eixos de grafico: `rgba(255,255,255,0.3)` e `rgba(255,255,255,0.35)`
- Labels de navegacao inativos: `text-white/35`
- Label "Securitizacao Imobiliaria" na sidebar: `text-white/30`
- Texto dos ANEXO_ITEMS: `text-white/30`

Calculando contraste: branco com 30% opacidade sobre #0A0B10 resulta em aproximadamente #4D4D54 sobre #0A0B10, que tem ratio de ~2.8:1. O minimo WCAG AA para texto pequeno e 4.5:1.

**Evidencia:** WCAG 2.1 criterio 1.4.3 (contraste minimo). Texto com ratio abaixo de 4.5:1 nao e acessivel para usuarios com baixa visao.

**Impacto:** Impossibilita uso por usuarios com deficiencia visual. Tambem dificulta leitura em ambientes com brilho de tela reduzido (reunioes de board em salas escuras, por exemplo).

**Correcao recomendada:**

| Elemento | Atual | Minimo Recomendado |
|----------|-------|-------------------|
| Labels de KPI | `text-white/45` | `text-white/60` |
| Subtitulos de secao | `text-white/30` | `text-white/50` |
| Labels de nav inativos | `text-white/35` | `text-white/50` |
| Eixos de grafico | `0.3` / `0.35` | `0.5` |
| Texto de legenda | `0.45` | `0.6` |
| Texto de secao ANEXOS | `text-white/25` | `text-white/45` |

---

#### P2-ACESS-02: Graficos sem texto alternativo ou fallback textual

**Problema:** Nenhum dos graficos Recharts possui `aria-label` ou descricao acessivel. Usuarios de leitores de tela nao tem acesso a NENHUMA informacao dos graficos.

**Correcao recomendada:**
- Adicionar `role="img"` e `aria-label` descritivo ao container de cada grafico
- Exemplo: `aria-label="Grafico de barras mostrando distribuicao de contratos por faixa de atraso. Adimplente: 190 contratos, 1 a 30 dias: 28 contratos..."`
- Para graficos complexos, adicionar link "Ver dados em tabela" como alternativa acessivel

---

#### P2-ACESS-03: Botao de collapse do NavSidebar sem area de toque adequada

**Problema:** O botao de collapse do menu lateral tem `h-7 w-7` (28px), abaixo do minimo recomendado de 44x44px para alvos de toque (WCAG 2.5.5).

**Correcao recomendada:** Aumentar para `h-9 w-9` (36px) ou adicionar padding de toque maior.

---

### 2.6 HIERARQUIA VISUAL E LAYOUT

#### P1-VIS-01: Pagina de PDD desproporcional -- apenas tabela sem visualizacao

**Problema:** A pagina de PDD consiste apenas em uma tabela e um texto explicativo. Nao ha NENHUM grafico visualizando a distribuicao de PDD por rating, a comparacao PDD Liquid vs PDD Bacen, ou o delta entre provisoes. E a unica pagina de dados que nao tem visualizacao grafica.

**Evidencia:** Principio de Tufte sobre comparacao visual. Dados numericos em tabela sao mais dificeis de interpretar que representacoes graficas, especialmente para comparacoes (PDD Liquid vs Bacen).

**Correcao recomendada:** Adicionar:
1. Grafico de barras agrupadas: PDD Liquid vs PDD Minimo Bacen por Rating
2. Grafico de barras com Delta PDD por Rating (destaque visual para deltas negativos em vermelho)
3. KPIs resumo no topo: Total PDD Liquid, Total PDD Bacen, Delta Total

---

#### P1-VIS-02: Titulos de pagina com pattern de quebra de linha inconsistente

**Problema:** Algumas paginas usam `<br />` para quebrar titulos em duas linhas artisticas, outras nao:
- Contratos: `Resumo<br/>Empreendimentos`
- Pagamentos: `Evolucao dos<br/><span>Pagamentos</span>`
- Fluxo de Caixa: `<span>Fluxo de Caixa</span><br/><span>Ajustado ao Risco</span>`
- PDD: titulo simples sem quebra
- Simulacao: `<span>Simulacao</span><br/><span>em Bancos</span>`

E o uso de `text-muted-foreground` vs `text-foreground` para diferenciar "prefixo" de "titulo" tambem e inconsistente.

**Correcao recomendada:** Padronizar todos os titulos de pagina com o formato:
```
<h2 className="font-display text-2xl md:text-3xl font-bold tracking-tighter text-foreground">
  {titulo_principal}
</h2>
<p className="mt-2 text-sm text-white/50 max-w-2xl">
  {descricao}
</p>
```
Eliminar o pattern de `<br />` com cores diferentes. E um pattern decorativo que dificulta a escaneabilidade.

---

#### P2-VIS-03: Pagina de Fluxo de Caixa com layout side-by-side (tabela + graficos) que quebra em mobile

**Problema:** O layout `grid gap-6 lg:grid-cols-[300px_1fr]` coloca a tabela em coluna estreita de 300px a esquerda e os graficos a direita. Em desktop funciona, mas a tabela fica comprimida e em mobile empilha sem boa hierarquia.

**Correcao recomendada:** Inverter a ordem: graficos primeiro (informacao visual primaria), tabela abaixo (informacao detalhada). Usar layout full-width para ambos.

---

#### P2-VIS-04: Codificacao de cor de rating nao documentada na interface

**Problema:** Os graficos usam uma escala de cores para ratings A-H (verde-oliva para A, vermelho para H), mas nao ha legenda explicando a logica cromática. A escala so e documentada internamente em `chart-theme.ts`.

**Correcao recomendada:** Adicionar legenda visual nas paginas que usam cores de rating (Contratos/Visao Macro, PDD) explicando: "Cores de A (baixo risco) a H (alto risco)".

---

### 2.7 ESTADOS E FEEDBACK

#### P1-STATE-01: Mensagem de erro expoe detalhes tecnicos ao usuario

**Problema:** A mensagem de erro exibida no Dashboard e: "Erro ao carregar dados: Access Denied: Project bq-data-wh: User does not have bigquery.jobs.create permission in project bq-data-wh.. Exibindo dados locais."

Esta mensagem expoe nome de projeto BigQuery, tipo de permissao e detalhes de infraestrutura ao usuario final.

**Evidencia:** Heuristica de Nielsen #9 (ajuda para reconhecer, diagnosticar e recuperar erros). Mensagens de erro devem ser em linguagem natural, sem detalhes tecnicos.

**Correcao recomendada:**
- Mensagem publica: "Nao foi possivel conectar a base de dados em tempo real. Exibindo dados do ultimo cache disponivel."
- Log tecnico: manter no console.error para debug
- Adicionar acao sugerida: "Verifique sua conexao ou entre em contato com o suporte."

---

#### P2-STATE-02: Toggle "Comparar" sem indicacao do que sera comparado

**Problema:** O switch "Comparar" nos GlobalFilters nao explica o que sera comparado (periodo anterior? benchmark?). O toggle ativa comparacao entre periodos mas nao ha indicacao visual de qual periodo esta sendo comparado.

**Correcao recomendada:**
- Adicionar tooltip: "Ativar comparacao com o periodo anterior"
- Quando ativo, exibir badge: "vs. dez/2025" (periodo anterior ao selecionado)

---

### 2.8 OPORTUNIDADES DE DIFERENCIACAO (P3)

#### P3-ENH-01: Adicionar breadcrumbs para contexto de navegacao

Paginas internas como Anexos nao tem indicacao de onde o usuario esta na hierarquia. Adicionar breadcrumbs: `Dashboard > Anexos > Rating Liquid`.

#### P3-ENH-02: Implementar atalhos de teclado para power users

Analistas que usam a plataforma diariamente se beneficiariam de:
- `Ctrl+K` / `Cmd+K`: Busca global (paginas, contratos, metricas)
- `Ctrl+E`: Expandir/colapsar sidebar
- `Ctrl+Shift+A`: Abrir assistente IA
- `1-9`: Navegacao rapida entre paginas

#### P3-ENH-03: Adicionar modo de comparacao visual nos graficos

Implementar overlay de periodo anterior (linha tracejada) nos graficos quando o toggle "Comparar" esta ativo. Isso permitiria comparacao visual direta periodo-a-periodo.

#### P3-ENH-04: Implementar favoritos/pinning de KPIs

Permitir que o usuario escolha quais KPIs aparecem primeiro no dashboard, baseado no seu perfil de uso (CFO vs. analista vs. cobranca).

#### P3-ENH-05: Adicionar indicadores de data de atualizacao

Exibir timestamp da ultima atualizacao dos dados: "Dados atualizados em 13/03/2026 as 08:30". Critico para gestores que tomam decisoes baseadas na atualidade dos dados.

#### P3-ENH-06: Implementar drill-down dos KPIs para paginas relacionadas

O KPI "Inadimplencia" no Dashboard deveria ter link direto para a pagina de Elegibilidade/Inadimplencia. O KPI "Saldo Devedor" deveria linkar para Contratos.

#### P3-ENH-07: Adicionar alerta visual para metricas em zona critica

Quando inadimplencia ultrapassa threshold configuravel (ex: > 5%), exibir badge de alerta vermelho pulsante no KPI e notificacao no sino (Bell) da AppBar.

#### P3-ENH-08: Dark mode/Light mode toggle

Embora o dark mode seja primario, considerar oferecer light mode para uso em impressoes e apresentacoes projetadas em ambientes claros.

---

## 3. Priorizacao de Implementacao

### Sprint 1 -- Correcoes Criticas e Quick Wins (1-2 semanas)

| ID | Descricao | Esforco | Impacto |
|----|----------|---------|---------|
| P0-TERM-01 | Adicionar acentuacao em toda a interface | Medio | Alto |
| P0-DESC-02 | Corrigir eixo X do grafico de evolucao | Baixo | Alto |
| P0-COMP-01 | Unificar componentes KpiCard | Alto | Alto |
| P1-NAV-03 | Corrigir cor azul no BottomTabBar | Baixo | Medio |
| P1-TERM-05 | Renomear "ID Contrato" para "Qtd. Contratos" | Baixo | Medio |
| P1-STATE-01 | Sanitizar mensagens de erro | Baixo | Alto |
| P1-COMP-04 | Remover .slice(0, 8) do Fluxo de Caixa | Baixo | Medio |
| P2-NAV-05 | Titulos especificos para paginas de Anexo | Baixo | Baixo |
| P2-COMP-07 | Corrigir header duplicado em AnexosElegibilidade | Baixo | Baixo |

### Sprint 2 -- Melhorias de Contexto e Acessibilidade (2-3 semanas)

| ID | Descricao | Esforco | Impacto |
|----|----------|---------|---------|
| P0-DESC-01 | Adicionar descricoes em todas as paginas | Baixo | Alto |
| P0-TERM-02 | Tooltips para sigla PDD na navegacao | Baixo | Medio |
| P1-TERM-03 | Sistema de tooltips para termos tecnicos | Medio | Alto |
| P1-ACESS-01 | Corrigir contrastes de texto (WCAG AA) | Medio | Alto |
| P1-VIS-01 | Adicionar graficos na pagina PDD | Medio | Alto |
| P1-DESC-03 | Subtitulos explicativos em graficos | Baixo | Medio |
| P1-TERM-04 | Padronizar terminologia "Faixa de Atraso" | Baixo | Baixo |
| P2-TERM-06 | Adicionar simbolo R$ no formatCurrency | Baixo | Medio |

### Sprint 3 -- Melhorias Estruturais (3-4 semanas)

| ID | Descricao | Esforco | Impacto |
|----|----------|---------|---------|
| P1-NAV-01 | Reorganizar conteudo Elegibilidade/Inadimplencia | Alto | Alto |
| P1-NAV-02 | Agrupar itens de navegacao | Medio | Medio |
| P1-COMP-02 | Paginacao nas tabelas | Medio | Alto |
| P1-COMP-03 | Feedback de filtros ativos | Medio | Medio |
| P1-VIS-02 | Padronizar titulos de pagina | Baixo | Medio |
| P2-COMP-05 | Exportacao CSV em todas as tabelas | Medio | Medio |
| P2-COMP-06 | Visibilidade de colunas no Contratos | Medio | Medio |
| P2-VIS-03 | Reorganizar layout Fluxo de Caixa | Baixo | Baixo |

### Sprint 4 -- Enhancements e Polish (continuo)

Todos os itens P3 e refinamentos dos P2 restantes.

---

## 4. Recomendacoes de Texto/Copy por Pagina

### 4.1 Dashboard (`/dashboard`)

**Titulo:** Visao Geral
**Subtitulo:** Resumo consolidado da carteira securitizada com indicadores-chave e tendencias

**KPIs -- labels e tooltips:**

| KPI | Label Atual | Label Proposto | Tooltip |
|-----|------------|---------------|---------|
| total_contratos | Total Contratos | Total de Contratos | Quantidade total de contratos ativos na carteira |
| saldo_nominal | Saldo Nominal | Saldo Nominal | Valor total contratado antes de correcao monetaria e pagamentos |
| saldo_devedor | Saldo Devedor | Saldo Devedor | Divida atualizada considerando pagamentos realizados e correcao |
| valor_atraso | Valor em Atraso | Valor em Atraso | Soma dos valores vencidos e nao pagos de todos os contratos |
| inadimplencia_pct | Inadimplencia | Inadimplencia (%) | Razao entre o valor em atraso e o saldo devedor total |
| over_90 | Over 90 dias | Over 90 (%) | Percentual de contratos com mais de 90 dias de atraso |

**Graficos:**
- "Evolucao do Saldo Devedor" -> "Evolucao do Saldo Devedor" / subtitle: "Historico mensal do saldo devedor da carteira"
- "Contratos por Faixa de Atraso" -> manter / subtitle: "Distribuicao por dias de atraso no periodo selecionado"

**Tabela:**
- "Indicadores por Faixa de Atraso" -> manter / subtitle: "Detalhamento de metricas por faixa de dias em atraso"

**Mensagem de erro:**
- Atual: expoe detalhes de BigQuery
- Proposto: "Os dados em tempo real estao temporariamente indisponiveis. Exibindo ultimo cache disponivel."

---

### 4.2 Contratos (`/contratos`)

**Titulo:** Contratos
**Subtitulo:** Visao consolidada por empreendimento com metricas de risco, unidades comercializadas e distribuicao de rating

**Tabs:**
- "Resumo" -> "Resumo por Empreendimento"
- "Unidades" -> "Unidades Comercializadas"
- "Visao Macro" -> "Rating e Saldo"

**Titulo interno tab Resumo:**
- Atual: `Resumo<br/>Empreendimentos`
- Proposto: Remover. O tab ja indica o conteudo.

---

### 4.3 Pagamentos (`/pagamentos`)

**Titulo:** Pagamentos
**Subtitulo:** Historico e composicao dos recebimentos mensais da carteira

**Headers de tabela a melhorar:**
- "Data Base Report" -> "Competencia" (ou "Mes/Ano")
- "Pagamento antecipado" -> "Pagamento Antecipado"
- "Vencimento na referencia" -> "No Vencimento"
- "Recuperacao mes anterior" -> "Recuperacao do Mes Anterior"

---

### 4.4 Fluxo de Caixa (`/fluxo-de-caixa`)

**Titulo:** Fluxo de Caixa
**Subtitulo:** Projecao de recebiveis esperados vs contratados, com ajuste de risco de credito

**Headers de tabela:**
- "Data Base Fluxo" -> "Competencia"

**Graficos:**
- "Fluxo de Parcela Ajustado ao Risco" / subtitle: "Comparativo entre fluxo esperado (com desconto de PDD) e contratado"
- "Fluxo de Caixa Ajustado ao Risco" -> "Fluxo Esperado Mensal" / subtitle: "Volume projetado de recebiveis ajustado ao risco"

---

### 4.5 PDD (`/pdd`)

**Titulo:** PDD -- Provisao para Devedores Duvidosos
**Subtitulo:** Comparativo entre a provisao minima Bacen (Res. 2682) e a provisao estimada pelo modelo Liquid

**Headers de tabela:**
- "Rating Liquid" -> manter
- "ID Contrato" -> "Contratos" (correcao P1-TERM-05)
- "PDD Minimo Bacen" -> "PDD Min. Bacen"
- "Delta PDD" -> "Delta (Bacen - Liquid)"

**Nota explicativa (texto existente reformulado):**
```
A Provisao para Devedores Duvidosos (PDD) estima a perda esperada da carteira.
A PDD Minima Bacen segue a Resolucao 2682, classificando por dias de atraso.
A PDD Liquid considera fatores adicionais do modelo proprietario de rating.
O Delta indica a diferenca entre as duas provisoes -- valores positivos
significam que o modelo Liquid projeta mais risco que o minimo regulatorio.
Nota: nao considera recuperacao em caso de inadimplencia (LGD).
```

---

### 4.6 Pricing (`/pricing`)

**Titulo:** Pricing da Carteira
**Subtitulo:** Precificacao total com desagio por rating e elegibilidade -- base para operacoes de securitizacao e venda institucional

**Tabs:**
- "Por Rating" -> "Pricing por Rating Liquid"
- "Por Elegibilidade" -> "Pricing por Elegibilidade"

---

### 4.7 Simulacao (`/simulacao`)

**Titulo:** Simulacao de LTV Bancario
**Subtitulo:** Stress test que simula o enquadramento dos contratos nas faixas de LTV utilizadas pelos bancos para repasse

**KPIs:**
- "Contratos com LTV > 80%" -> manter, adicionar tooltip: "Contratos cuja razao divida/valor do imovel ultrapassa 80%, considerados de alto risco pelos bancos"
- "Saldo Devedor com LTV > 80%" -> manter

**Tabela:**
- "LTV x LTV Stress (10%)" -> "Migracao de Faixas de LTV com Stress de 10%"
- Adicionar nota: "Simula o efeito de uma desvalorizacao de 10% nos imoveis sobre a distribuicao de LTV"

---

### 4.8 Elegibilidade (`/elegibilidade`)

**Titulo:** Analise de Inadimplencia e Elegibilidade
**Subtitulo:** Visao detalhada da inadimplencia por LTV, safra, faixa de atraso, matriz de cobranca e restricoes

**Tabs:**
- "LTV" -> "Inadimplencia por LTV"
- "Safra" -> "Inadimplencia por Safra"
- "Faixa" -> "Por Faixa de Atraso"
- "Matriz Cobranca" -> "Matriz de Cobranca"
- "Restricoes" -> "Restricoes e Gravames"

---

### 4.9 Repasse (`/repasse`)

**Titulo:** Estrategia de Repasse
**Subtitulo:** Agrupamento de contratos por viabilidade de repasse bancario, considerando restricoes, renda e LTV

**Titulo atual excessivamente longo:**
- Atual: "Grupos Estrategia de Repasse vs Renda vs Pro-Soluto"
- Proposto no h2: "Estrategia de Repasse"
- Proposto como subtitulo: "Grupos por restricao, renda e pro-soluto -- viabilidade de repasse bancario"

---

### 4.10 Detalhamento (`/detalhamento`)

**Titulo:** Detalhamento Analitico
**Subtitulo:** Base contrato a contrato com busca, filtros e exportacao completa

**Texto adicional:**
Manter a descricao existente "Visualizacao detalhada de todos os contratos da carteira".

---

### 4.11 Anexos

**Anexo Rating:**
- AppBar: `title="Anexo: Rating Liquid"`
- Subtitulo: "Metodologia de classificacao de risco do modelo proprietario Liquid"

**Anexo PDD:**
- AppBar: `title="Anexo: PDD"`
- Subtitulo: "Tabela de provisao conforme Resolucao Bacen 2682 e metodologia Liquid"

**Anexo Elegibilidade:**
- AppBar: `title="Anexo: Criterios de Elegibilidade"`
- Subtitulo: "Criterios utilizados para classificar contratos quanto a elegibilidade para securitizacao"
- Corrigir header duplicado "Prazo Decorrido" -> segundo deve ser "Prazo Remanescente"

---

## 5. Componentes Novos Recomendados

### 5.1 InfoTooltip

```
Arquivo: src/shared/ui/info-tooltip.tsx
Props: term: string (chave do glossario)
Dependencia: Radix UI Tooltip, arquivo glossary.ts
Visual: icone Info (14px) com opacidade 0.3, hover mostra tooltip com fundo #0A0B10
```

### 5.2 PageHeader

```
Arquivo: src/widgets/page-header/ui/PageHeader.tsx
Props: title, subtitle?, breadcrumbs?, actions?
Objetivo: Padronizar header de todas as paginas, eliminando inconsistencias de estilo
```

### 5.3 FilterContextBar

```
Arquivo: src/widgets/filter-context-bar/ui/FilterContextBar.tsx
Props: dateRange, projetos, compareEnabled
Visual: Barra fina abaixo da AppBar com resumo dos filtros ativos
```

### 5.4 DataTableWidget v2 (extensoes)

```
Novas props:
- exportable?: boolean (habilita botao CSV)
- pageSize?: number (default 25)
- columnVisibility?: Record<string, boolean> (colunas visiveis)
- stickyFirstColumn?: boolean
```

---

## 6. Metricas de Sucesso

Apos implementacao das melhorias, medir:

| Metrica | Baseline Estimado | Target |
|---------|------------------|--------|
| Tempo para localizar metrica especifica | >15s | <8s |
| Erros de interpretacao de dados em teste | 3-5 por sessao | <1 por sessao |
| SUS Score (System Usability Scale) | ~65 | >80 |
| Taxa de conclusao de tarefa | ~75% | >90% |
| Feedback qualitativo "credibilidade visual" | Neutro | Positivo |

---

## Apendice A: Checklist de Acessibilidade (WCAG 2.1 AA)

- [ ] Todos os textos com ratio de contraste >= 4.5:1 (texto normal) ou >= 3:1 (texto grande)
- [ ] Todos os graficos com descricao alternativa (`aria-label`)
- [ ] Todos os botoes com `aria-label` descritivo
- [ ] Navegacao por teclado funcional em todos os componentes interativos
- [ ] Focus visible em todos os elementos interativos
- [ ] Tabelas com headers semanticos (`<th>` com `scope`)
- [ ] Formularios com labels associados
- [ ] Animacoes respeitam `prefers-reduced-motion`
- [ ] Cores nao sao o unico meio de transmitir informacao (ex: adicionar icones ou patterns alem da cor de risco)

---

## Apendice B: Glossario de Termos (para `shared/config/glossary.ts`)

```typescript
export const GLOSSARY: Record<string, string> = {
  ltv: 'Loan-to-Value: razao entre o saldo devedor e o valor do imovel. Quanto maior, maior o risco.',
  pdd: 'Provisao para Devedores Duvidosos: estimativa contabil de perda esperada na carteira.',
  over_90: 'Percentual de contratos com atraso superior a 90 dias.',
  pro_soluto: 'Operacao em que o cessionario assume o risco de inadimplencia do devedor.',
  delta_pdd: 'Diferenca entre a PDD minima Bacen e a PDD calculada pelo modelo Liquid.',
  rating_liquid: 'Classificacao de risco proprietaria da Liquid, de A (baixo risco) a H (default).',
  desagio: 'Percentual de desconto aplicado sobre o valor nominal na precificacao da carteira.',
  safra: 'Periodo (mes/ano) em que o contrato foi originado.',
  elegibilidade: 'Classificacao do contrato quanto aos criterios para securitizacao ou repasse.',
  saldo_nominal: 'Valor total contratado, antes de ajustes e correcao monetaria.',
  saldo_devedor: 'Valor atualizado da divida, ja considerando pagamentos e correcao.',
  inadimplencia: 'Razao entre o valor em atraso e o saldo devedor total da carteira.',
  valor_atraso: 'Soma dos valores vencidos e nao pagos de todos os contratos.',
  faixa_atraso: 'Agrupamento de contratos por quantidade de dias em atraso.',
  correcao_monetaria: 'Indice de atualizacao do valor dos contratos (ex: IPCA, IGP-M, TR).',
  prazo_remanescente: 'Quantidade de meses restantes ate o vencimento do contrato.',
  covenant: 'Clausula contratual que estabelece indicadores minimos a serem mantidos.',
  stress_test: 'Simulacao de cenario adverso para avaliar a resiliencia da carteira.',
  fluxo_esperado: 'Projecao de recebiveis futuros ajustada pelo risco de inadimplencia.',
  fluxo_contratado: 'Valor total contratado a receber no periodo, sem ajuste de risco.',
  matriz_cobranca: 'Classificacao de contratos por perfil de cobranca e categoria de risco.',
};
```
