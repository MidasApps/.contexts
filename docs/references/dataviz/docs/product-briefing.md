# Liquid DataViz -- Briefing de Produto

> ⚠️ **DOCUMENTO HISTÓRICO (13/04/2026) — descreve um produto que mudou.**
> Desde então: os clientes OM/BRZ/CONX/IMCASA saíram (só `vila-rosa` existe),
> as páginas fixas citadas abaixo (Inadimplência, PDD, Fluxo de Caixa, Pricing,
> Repasse, Detalhamento) foram removidas em favor de relatórios dinâmicos, e a
> IA roda em Mastra, não em Vercel AI SDK direto (ADR-0014).
> Para o estado atual, veja `CLAUDE.md` e `adrs/decisions/`.

**Versao do documento:** 2.0.0 | **Atualizado em:** 13/04/2026
**Produto:** Liquid DataViz (liquid-play-dataviz)
**Tipo:** Plataforma SaaS de visualizacao de dados para securitizacao de credito imobiliario

---

## 1. Visao Geral do Produto

### 1.1 Nome e Proposito

**Liquid DataViz** e uma plataforma de Business Intelligence especializada em **securitizacao de credito imobiliario**. O produto transforma dados brutos de carteiras de credito (armazenados em BigQuery) em dashboards interativos, indicadores de risco, projecoes financeiras e analises assistidas por inteligencia artificial.

### 1.2 Proposta de Valor

- **Transparencia da carteira:** Visibilidade completa do desempenho de carteiras securitizadas, desde indicadores macro (saldo devedor, inadimplencia) ate detalhamento contrato a contrato.
- **Gestao de risco proativa:** Monitoramento de PDD, rating proprietario (Liquid), LTV, stress tests e covenants, com alertas visuais quando indicadores ultrapassam limiares criticos.
- **Inteligencia artificial integrada:** Assistente conversacional com 8 agentes especializados que realiza consultas SQL em linguagem natural, gera projecoes, simula cenarios e exporta relatorios.
- **Analise conversacional (Explore):** Ambiente canvas onde a IA monta dashboards customizados sob demanda com graficos, KPIs e tabelas.
- **Multi-cliente:** Infraestrutura que atende multiplas incorporadoras/originadoras com dados isolados, schemas personalizaveis e controle granular de acesso.

### 1.3 Publico-Alvo e Personas

| Persona | Descricao | Uso Principal |
|---|---|---|
| **Gestor de Carteira** | Profissional de securitizadora que monitora o desempenho da carteira | Dashboard, Inadimplencia, PDD, Fluxo de Caixa |
| **Analista de Risco** | Avalia a qualidade crediticia dos ativos | PDD, Pricing, Simulacao de LTV, Rating |
| **Operador de Repasse** | Gerencia estrategia de repasse bancario dos contratos | Repasse, Elegibilidade, Detalhamento |
| **Executivo / Investidor** | Precisa de visao consolidada e relatorios para tomada de decisao | Visao Geral, Exportacao PDF, AI Chat |
| **Administrador do Sistema** | Configura clientes, permissoes e schemas | Painel Admin |

### 1.4 Problema que Resolve

Securitizadoras de credito imobiliario operam com carteiras de centenas a milhares de contratos, espalhados entre multiplos empreendimentos. Os dados residem em bases de dados analiticas (BigQuery) e requerem conhecimento tecnico para serem consultados. O Liquid DataViz **democratiza o acesso** a essas informacoes, oferecendo:

- Dashboards pre-configurados com metricas do setor (PDD Bacen, LTV, ratings, faixas de atraso)
- Comparacao temporal automatica entre periodos
- Analise por IA que elimina a necessidade de escrever SQL
- Controle de acesso que permite compartilhar dados com investidores e auditores

---

## 2. Arquitetura do Produto

### 2.1 Stack Tecnologico (Resumo Executivo)

| Camada | Tecnologia | Funcao |
|---|---|---|
| Frontend | Next.js 16, React, Tailwind CSS v4 | Interface web responsiva com tema escuro |
| Componentes UI | shadcn/ui + Radix UI | Biblioteca de componentes acessiveis |
| Graficos | Recharts | Visualizacoes de dados (barras, linhas, areas, compostos) |
| Tabelas | TanStack React Table | Tabelas com ordenacao, paginacao e colunas ocultas |
| Estado Global | Zustand + React Context | Gerenciamento de estado do cliente ativo e filtros |
| Backend de Dados | Google BigQuery | Data warehouse para consultas analiticas |
| Autenticacao | Firebase Auth | Login com Google e email/senha |
| Banco de Configuracao | Firebase Firestore | Clientes, usuarios, grupos de permissao, conversas |
| IA | Vercel AI SDK + Google Vertex AI | Chat com agentes especializados |
| Exportacao | Puppeteer (PDF), jspdf, CSV nativo | Relatorios exportaveis |

### 2.2 Modelo Multi-Cliente

Cada **cliente** (incorporadora/originadora) e registrado no Firestore com:

- **ID e nome** (ex: OM, BRZ, CONX, IMCASA)
- **Dataset BigQuery** dedicado -- garantindo isolamento total dos dados
- **Schema customizavel** -- mapeamento de campos BigQuery para nomes padrao do sistema, permitindo que clientes com estruturas de dados diferentes compartilhem a mesma interface
- **Cor e inicial** -- identidade visual no switcher

Quando um campo nao existe no schema de um cliente, o sistema exibe um estado "indisponivel" no lugar do indicador (em vez de erro), garantindo que a plataforma funcione mesmo com datasets incompletos.

**Persistencia de filtros por cliente:** Ao trocar de cliente, o sistema salva os filtros atuais e restaura os filtros previamente configurados para o novo cliente.

### 2.3 Modelo de Autenticacao e Seguranca

**Autenticacao:**
- Login via Google (OAuth) ou email/senha (Firebase Auth)
- Tokens Firebase sao enviados a cada requisicao API e validados no servidor
- Modo embarcado via postMessage para integracao em shells externos (permite que a plataforma seja embutida como iframe em aplicacoes terceiras, com autenticacao propagada via postMessage)

**Autorizacao (3 niveis):**

1. **Admin:** Usuarios com dominio de email configurado (ex: `@liquid.com.br`) tem acesso total a todos os clientes e funcionalidades, alem do painel de administracao.
2. **Grupos de Permissao:** Definem conjuntos de rotas (paginas) e indicadores acessiveis. Um grupo pode dar acesso apenas ao Dashboard e Contratos, por exemplo.
3. **Acesso por Cliente:** Cada usuario tem acesso a clientes especificos, com possibilidade de overrides de rotas e indicadores por cliente.

**Controle granular de indicadores:** Cada KPI, grafico e tabela tem um ID de indicador (ex: `dashboard.total_contratos`, `pdd.liquid_vs_bacen`). Grupos podem definir quais indicadores sao visiveis, e quando um indicador nao e permitido, ele e oculto ou substituido por um placeholder, conforme configuracao do grupo (`hidden` ou `placeholder`).

### 2.4 Integracoes Externas

| Integracao | Uso |
|---|---|
| **Google BigQuery** | Fonte de dados analitica para todas as consultas de carteira |
| **Firebase Auth** | Autenticacao de usuarios |
| **Firebase Firestore** | Configuracao de clientes, usuarios, grupos, conversas de IA |
| **Google Vertex AI** | Motor de IA (Gemini) para chat e agentes |
| **Banco Central do Brasil (API)** | Indicadores economicos (SELIC, IPCA, etc.) via agente externo |
| **Firecrawl** | Web scraping para busca de dados economicos e regulatorios |
| **Puppeteer** | Renderizacao headless de PDF para exportacao |

### 2.5 Endpoints de API

| Endpoint | Metodo | Funcao |
|---|---|---|
| `/api/bigquery` | POST | Consulta principal ao BigQuery com auth, schema mapping e campo de indisponibilidade |
| `/api/chat` | POST | Chat AI com streaming via Vercel AI SDK |
| `/api/canvas-chat` | POST | Canvas Orchestrator para Explore (gera dashboards via IA) |
| `/api/benchmark` | POST | Benchmark agregado anonimizado de carteiras Liquid com cache. Fornece dados de mercado (inadimplencia media, over90, LTV, rating, spread) para comparacao da carteira do cliente com a media do setor. |
| `/api/export-pdf` | POST | Renderizacao de PDF via Puppeteer headless |
| `/api/download/[filename]` | GET | Entrega de arquivos efemeros (PDF/CSV) gerados pela IA. Armazenados em `/tmp` com nomes UUID, sem autenticacao (security-through-obscurity por design, pois links de download nao suportam headers). |
| `/api/clients` | POST | CRUD de clientes (admin) |
| `/api/groups` | POST | CRUD de grupos de permissao (admin) |
| `/api/users` | POST | CRUD de usuarios (admin) |
| `/api/schema-detect` | POST | Auto-deteccao de schema de datasets BigQuery para configuracao de novos clientes |
| `/api/firecrawl` | POST | Proxy para Firecrawl (web scraping de dados economicos) |

---

## 3. Mapa de Funcionalidades

### 3.1 Visao Geral (Dashboard)

**Rota:** `/dashboard`
**Descricao:** Painel consolidado com os principais indicadores da carteira securitizada. Ponto de entrada para todas as analises.

**Componentes:**
- **6 KPI Cards** com sparkline (mini-grafico de tendencia), badge de variacao e alerta visual:
  - Total de Contratos (link para `/contratos`)
  - Saldo Nominal
  - Saldo Devedor
  - Valor em Atraso (alerta se > 5%)
  - Taxa de Inadimplencia (alerta se > 5%)
  - Atraso > 90 dias (alerta se > 1%)
- **Grafico de Evolucao do Saldo Devedor:** Composicao de barras + linha mostrando tendencia mensal. Suporta overlay com periodo comparativo (linha tracejada).
- **Grafico de Contratos por Faixa de Atraso:** Barras com gradiente de cor (verde para adimplentes ate laranja para > 360 dias).
- **Tabela de Indicadores por Faixa de Atraso:** Dados detalhados com linha de total.

**Dados:** `useDashboardSummary` (resumo), `useDashboardFaixaAtraso` (faixas), `useKpiHistory` (sparklines), `useComparisonData` (comparativo).

**Filtros:** Data-base (range de meses), empreendimentos. Nao exibe GlobalFilters inline (apenas na AppBar).

**Diferencial:** Cada KPI e clicavel e abre um modal expandido (`KpiExpandedModal`) com grafico temporal completo, tendencia, e sugestoes contextuais de analise geradas pela IA. O modal tambem permite acionar o chat AI ja contextualizado com o indicador selecionado.

---

### 3.2 Contratos

**Rota:** `/contratos`
**Descricao:** Visao consolidada dos contratos por empreendimento, com distribuicao de rating e evolucao temporal.

**Abas:**
1. **Resumo por Empreendimento** -- Tabela com 12 colunas: projeto, contratos, atraso, saldo devedor, inadimplencia, valor > 90 dias, restricoes, valor imovel, LTV, pricing, prazo remanescente. Cada celula numerica inclui DeltaBadge mostrando variacao vs. periodo comparativo.
2. **Unidades Comercializadas** -- Grafico composto (barras + linha) com evolucao mensal de contratos e valor dos imoveis.
3. **Distribuicao de Rating** -- Conjunto de 5 graficos:
   - Rating x Empreendimento (barras horizontais empilhadas com paginacao)
   - Evolucao do Rating por mes
   - Evolucao do Saldo Devedor por rating
   - Evolucao do Saldo em Atraso com linha de inadimplencia
   - Evolucao do Valor em Atraso por rating

**Filtros:** GlobalFilters (data-base, empreendimento, filtros avancados).

---

### 3.3 Pagamentos

**Rota:** `/pagamentos`
**Descricao:** Historico e composicao dos recebimentos mensais da carteira.

**Componentes:**
- **Tabela de Detalhamento:** Colunas para cada tipo de recebimento (pagamento antecipado, vencimento na referencia, recuperacao do mes anterior, recuperacao de periodos anteriores, valor total pago). Cada coluna tem valor absoluto e percentual. Exportavel como CSV.
- **Grafico de Composicao (Barras Empilhadas):** Proporcao percentual mensal de cada tipo de recebimento, com suporte a comparacao de periodos.

**Dados:** `usePagamentos` (evolucao), `usePageComparison` (comparativo).

**Valor de negocio:** Permite ao gestor entender a qualidade dos recebimentos -- se a carteira depende de recuperacoes (sinal de estresse) ou se os pagamentos sao predominantemente na referencia (sinal de saude).

---

### 3.4 Fluxo de Caixa

**Rota:** `/fluxo-de-caixa`
**Descricao:** Projecao de recebiveis futuros comparando cenarios com e sem ajuste de risco.

**Componentes:**
- **Grafico Composto -- Fluxo de Parcela Ajustado ao Risco:** Barras representando fluxo esperado (descontado por probabilidade de inadimplencia) + linha representando fluxo contratado (cenario sem perdas). Suporta comparacao com periodo anterior.
- **Grafico de Barras -- Fluxo Esperado Mensal:** Volume ajustado ao risco.
- **Tabela Mensal:** Valores esperados e contratados com DeltaBadge.

**Dados:** `useFluxoCaixa`, `usePageComparison`.

**Valor de negocio:** A diferenca entre fluxo contratado e esperado quantifica a **perda projetada** da carteira. Essencial para precificacao e decisao de investimento.

---

### 3.5 PDD -- Provisao para Devedores Duvidosos

**Rota:** `/pdd`
**Descricao:** Comparativo entre o modelo de provisao proprietario Liquid e a exigencia regulatoria minima do Bacen (Resolucao 2682).

**Componentes:**
- **3 KPI Cards:** Total PDD Liquid, Total PDD Minima Bacen, Delta PDD Total. Todos com sparkline e comparacao.
- **Grafico de Barras Empilhadas:** PDD Liquid vs. PDD Bacen por rating.
- **Tabela por Rating:** Contratos, PDD Bacen, PDD Liquid, Delta, valor em atraso, saldo devedor. Com linha de total e DeltaBadges.
- **Texto explicativo:** Nota tecnica sobre a metodologia de PDD.

**Valor de negocio:** O Delta PDD (diferenca entre modelo Liquid e exigencia Bacen) revela o **risco adicional nao capturado pela regulacao**, ajudando investidores a entender a real exposicao da carteira.

---

### 3.6 Pricing

**Rota:** `/pricing`
**Descricao:** Precificacao mark-to-model da carteira com desagio calculado por rating e elegibilidade.

**Componentes:**
- **2 KPI Cards:** Pricing Total e Desagio Medio (com alerta se < -15%).
- **Tabela por Rating Liquid:** Rating, contratos, atraso, LTV, prazos, correcao monetaria, saldo nominal, saldo devedor, pricing, desagio. Com DeltaBadges.
- **Tabela por Elegibilidade:** Mesma estrutura, segmentada por categoria de elegibilidade.

**Abas:** "Por Rating Liquid" e "Por Elegibilidade".

**Valor de negocio:** Permite avaliar o valor de mercado da carteira e entender como o desagio varia por perfil de risco, essencial para negociacoes de cessao de credito.

---

### 3.7 Simulacao de LTV

**Rota:** `/simulacao`
**Descricao:** Stress test de Loan-to-Value para avaliar resiliencia da carteira em cenarios de desvalorizacao imobiliaria.

**Componentes:**
- **2 KPI Cards:** Contratos com LTV > 80% e Saldo Devedor com LTV > 80%.
- **Grafico de Barras:** Distribuicao de saldo devedor por faixa de LTV bancario.
- **Matriz LTV x LTV Stress (10%):** Tabela mostrando migracao de contratos entre faixas de LTV em cenario de desvalorizacao de 10% do imovel.

**Valor de negocio:** Simula o impacto de uma queda nos precos dos imoveis sobre a carteira. Contratos com LTV > 80% sao mais vulneraveis pois o saldo devedor ultrapassa grande parte do valor da garantia.

---

### 3.8 Inadimplencia (Elegibilidade)

**Rota:** `/elegibilidade`
**Descricao:** Analise detalhada de inadimplencia com multiplas dimensoes: safra, faixa de atraso, rating, restricoes, matriz de cobranca.

**Componentes:**
- **4 KPI Cards:** Total Contratos, Saldo em Atraso, Taxa de Inadimplencia, Contratos > 90 dias.
- **Multiplas abas:**
  - Safra (cohort analysis por data de originacao)
  - Faixa de Atraso (distribuicao e evolucao)
  - LTV x Atraso (cruzamento de risco)
  - Restricoes por Rating
  - Matriz de Cobranca (perfil de cobranca x categoria de inadimplencia)

**Dados:** `useElegibilidade`, `useInadimplenciaDetalhe`, `useDashboardFaixaAtraso`, `useKpiHistory`.

**Valor de negocio:** Pagina mais rica em dimensoes de analise. Permite identificar **safras problematicas**, avaliar concentracao de risco por rating e planejar estrategias de cobranca.

---

### 3.9 Estrategia de Repasse

**Rota:** `/repasse`
**Descricao:** Agrupamento de contratos por viabilidade de repasse a instituicoes financeiras.

**Componentes:**
- **3 KPI Cards:** Total de Contratos, Saldo Devedor Total, Contratos com Restricao.
- **Tabela de Grupos de Estrategia:** 14 colunas incluindo restricoes, suficiencia de renda, delta de renda (baixo/medio/alto), limites de simulacao, modalidades pro-soluto. Com coluna fixa, colunas ocultas por padrao e linha de total. Exportavel como CSV.
- **Grafico de Saldo por Grupo:** Barras com comparacao.
- **Tabela de Descricao dos Grupos:** Explicacao dos criterios de classificacao (G1 a G4+).

**Dados:** `useRepasse`, `usePageComparison`.

**Valor de negocio:** Os 4+ grupos de repasse segmentam a carteira por combinacao de restricao cadastral, LTV bancario e renda. Isso permite priorizar quais contratos tem maior probabilidade de aprovacao pelo banco comprador.

---

### 3.10 Detalhamento (Base Analitica)

**Rota:** `/detalhamento`
**Descricao:** Listagem completa de contratos individuais da carteira.

**Componentes:**
- **Tabela de Contratos:** Colunas: data-base, projeto, ID contrato, CPF/CNPJ, tipo proponente, nome do cliente, unidade, data de emissao.
- **Exportacao CSV:** Botao dedicado para download completo.

**Dados:** `useDetalhamento`.

**Valor de negocio:** Acesso granular a dados individuais para auditoria, due diligence e investigacao especifica de contratos.

---

### 3.11 Analise Conversacional (Explore)

**Rota:** `/explore`
**Descricao:** Ambiente de analise baseado em IA onde o usuario descreve em linguagem natural o que deseja analisar, e o sistema gera dashboards customizados (canvas).

**Componentes:**
- **Sidebar de Conversas:** Lista de conversas anteriores com busca, pin, rename e delete. Persistidas no Firestore.
- **Tela de Boas-Vindas:** Input para nova analise com sugestoes de prompts.
- **Canvas Panel:** Area principal onde blocos sao renderizados em grid responsivo.

**Tipos de Blocos:**

| Tipo | Descricao |
|---|---|
| Text | Narrativa, titulo ou insight textual |
| KPI / KPIs | Indicador numerico com sparkline, trend e comparacao |
| Chart | Graficos (bar, line, area, composed, stacked-bar) gerados pela IA |
| Table | Tabela de dados com formatacao automatica |
| Skeleton | Placeholder animado enquanto a IA processa |

**Fluxo:**
1. Usuario digita uma pergunta/solicitacao
2. Canvas Orchestrator (IA) planeja a analise, cria paginas e declara layout
3. Sub-agentes consultam BigQuery, processam dados
4. Blocos sao preenchidos incrementalmente (streaming)
5. Resultado e salvo automaticamente no Firestore

**Funcionalidades do Canvas:**
- Multiplas paginas por conversa
- Layout em grid de 3 colunas com controle de colSpan
- Persistencia de conversas e blocos
- Restauracao de filtros por conversa
- Disponivel apenas em desktop (min. 1024px)

---

### 3.12 Chat AI (Sidebar)

**Rota:** Disponivel em qualquer pagina via sidebar
**Descricao:** Assistente conversacional contextualizado que entende a pagina atual, os filtros aplicados e os indicadores visiveis.

**8 Agentes Especializados:**

| Agente | Funcao |
|---|---|
| **Descriptive** | Consultas SQL e analise de dados (responde "o que aconteceu?") |
| **Diagnostic** | Investigacao de causas (responde "por que aconteceu?") |
| **Predictive** | Projecoes e tendencias (responde "o que vai acontecer?") |
| **Simulation** | Cenarios what-if e Monte Carlo |
| **Prescriptive** | Recomendacoes de acoes (responde "o que fazer?") |
| **Monitoring** | Verificacao de compliance e covenants |
| **Cashflow** | Analise especializada de fluxo de caixa |
| **External** | Busca de dados economicos (BCB, mercado) |

**Ferramentas dos Agentes (43 tools implementadas):**

| Categoria | Ferramentas |
|---|---|
| **Consulta de Dados** | `execute_sql` (BigQuery), `get_table_schema`, `get_sample_data`, `get_bcb_indicator`, `get_market_benchmarks`, `search_web` |
| **Analise Estatistica** | `calculate_statistics`, `calculate_correlations`, `run_hypothesis_test`, `detect_anomalies`, `run_clustering`, `run_causal_analysis` |
| **Risco de Credito** | `calculate_pd_lgd`, `calculate_stressed_ecl`, `build_vintage_curves`, `build_transition_matrix`, `build_survival_curve`, `check_eligibility`, `check_covenant_triggers`, `check_concentration_limits` |
| **Fluxo de Caixa** | `calculate_cpr_cdr`, `calculate_wal`, `calculate_excess_spread`, `calculate_coverage_ratios`, `compare_cashflows`, `decompose_payments` |
| **Simulacao e Stress** | `run_monte_carlo`, `run_sensitivity`, `run_scenario`, `apply_stress_macro`, `forecast_timeseries` |
| **Diagnostico e Prescricao** | `decompose_variation`, `evaluate_impact`, `generate_early_warnings`, `rank_actions`, `optimize_allocation`, `sentiment_analysis` |
| **Exportacao e Relatorios** | `generate_pdf`, `generate_csv`, `generate_compliance_report`, `extract_regulatory_updates` |
| **Pricing e Mercado** | `calculate_hhi`, `parse_macro_data` |
| **Interacao** | `ask_user` (solicita input do usuario durante analise) |

**Contexto automatico:** O chat recebe automaticamente o estado completo do dashboard (todos os KPIs, graficos e tabelas visiveis) via `buildAIContext()`, alem dos filtros ativos e o cliente selecionado.

**Arquitetura de prompts:** O sistema utiliza um `shared-context.ts` (14KB) com contexto de dominio compartilhado entre todos os agentes (glossario, regras de calculo, convencoes do setor), alem de prompts individuais por agente. Um sistema de `prompt-cache` no nivel do processo otimiza a reutilizacao de secoes estaticas.

**Sugestoes de indicadores:** O sistema oferece sugestoes contextuais baseadas na pagina atual e no indicador focado (quando o usuario expande um KPI), carregadas de `indicator-suggestions.ts` (60KB+ de conteudo).

---

### 3.13 Anexos (Documentacao de Referencia)

**Rotas:** `/anexos/rating`, `/anexos/pdd`, `/anexos/elegibilidade`

**3 paginas estaticas de documentacao:**

1. **Rating Liquid:** Tabela explicativa da escala de rating proprietario (A a H), com faixas de score e nivel de risco associado. Documentacao das variaveis do modelo.
2. **PDD (Resolucao 2682):** Tabela com a escala oficial do Bacen para provisao por dias de atraso (A0 a H, de 0% a 100%).
3. **Elegibilidade:** Criterios para classificacao de contratos como Elegivel, Elegibilidade Possivel, Elegibilidade Futura e Nao Elegivel, baseados em atraso, LTV, prazo e indice de correcao.

**Valor de negocio:** Documentacao de referencia para que analistas e investidores compreendam a metodologia por tras dos indicadores.

---

### 3.14 Landing Page (Vitrine do Produto)

**Rota:** `/` (pagina inicial para usuarios nao autenticados)
**Descricao:** Pagina de apresentacao comercial e marketing do produto, renderizada inteiramente client-side com animacoes e dados mock.

**Componentes:**
- **Hero Section:** Titulo, subtitulo e CTA de login com animacao de entrada.
- **Mock Dashboard:** Replica visual do dashboard real com 6 KPIs (sparklines SVG, delta badges), graficos e tabelas usando dados simulados -- serve como demonstracao interativa do produto.
- **Secao de Agentes IA:** Carrossel com os 8 agentes especializados, descricoes e icones.
- **Stack Tecnologico:** Grid visual com as tecnologias utilizadas.
- **CTA final:** Convite para login/cadastro.

**Valor de negocio:** Primeira impressao do produto para prospects e investidores. Demonstra visualmente as capacidades da plataforma antes do login.

---

### 3.15 Documentacao Interna do Sistema de IA (Docs)

**Rota:** `/docs`
**Descricao:** Pagina de referencia tecnica sobre a arquitetura de IA do produto, destinada a desenvolvedores e equipe interna.

**Componentes:**
- **DocsPage:** Painel principal com navegacao entre agentes.
- **AgentDetail:** Ficha detalhada de cada agente (descricao, ferramentas, prompts).
- **ArchitectureDiagram:** Diagrama visual da arquitetura de IA.
- **FlowDiagram:** Fluxos de interacao entre agentes e ferramentas.
- **MermaidDiagram:** Diagramas renderizados via Mermaid.js.
- **PromptViewer:** Visualizador de prompts dos agentes.
- **ToolCard:** Cards descritivos de cada ferramenta de IA.
- **docs-data.ts:** Base de dados com 67KB+ de conteudo documentacional.

---

### 3.16 Painel de Administracao

**Rota:** `/admin` (visivel apenas para admins)
**Descricao:** Gerenciamento completo de clientes, grupos de permissao e usuarios.

**3 Abas:**

1. **Clientes:** CRUD completo de clientes com:
   - Nome, dataset BigQuery, cor, inicial
   - **Schema Editor:** Interface para mapear campos entre o dataset BigQuery do cliente e os nomes padrao do sistema. Campos mapeados como `null` ficam indisponiveis na interface.

2. **Grupos:** Definicao de conjuntos de permissoes:
   - Rotas acessiveis (checkbox grid de todas as paginas)
   - Indicadores acessiveis (checkbox grid de todos os indicadores)
   - Modo de negacao (ocultar completamente vs. placeholder)

3. **Usuarios:** Gerenciamento de contas:
   - Email, grupos atribuidos
   - Acesso por cliente com overrides opcionais de rotas e indicadores

---

## 4. Jornadas do Usuario

### 4.1 Jornada Principal: Monitoramento de Carteira

```
Login -> Selecionar Cliente -> Dashboard (Visao Geral)
  |-> Identificar alerta em KPI (ex: inadimplencia > 5%)
  |-> Clicar no KPI para expandir com historico
  |-> Navegar para Inadimplencia (/elegibilidade) via link do KPI
  |-> Analisar por safra, faixa de atraso, rating
  |-> Abrir AI Chat para perguntar "por que a inadimplencia subiu?"
  |-> IA executa SQL, identifica safras e empreendimentos problematicos
  |-> Exportar relatorio como PDF
```

### 4.2 Jornada de Pricing e Due Diligence

```
Login -> Selecionar Cliente -> Pricing
  |-> Verificar pricing total e desagio medio
  |-> Analisar por rating (tab 1) e elegibilidade (tab 2)
  |-> Navegar para PDD para entender provisao
  |-> Comparar com periodo anterior (ativar comparacao)
  |-> Navegar para Fluxo de Caixa para ver projecao
  |-> Ir ao Explore e pedir "analise completa de pricing com stress test"
```

### 4.3 Jornada de Repasse Bancario

```
Login -> Selecionar Cliente -> Repasse
  |-> Identificar distribuicao de contratos por grupo
  |-> Filtrar por grupo de repasse especifico (filtro avancado)
  |-> Verificar restricoes e suficiencia de renda
  |-> Navegar para Simulacao de LTV para stress test
  |-> Verificar detalhamento dos contratos (/detalhamento)
  |-> Exportar CSV para envio ao banco
```

### 4.4 Jornada de Analise Conversacional

```
Login -> Clicar "Analise Conversacional" no menu lateral
  |-> Descrever analise desejada em linguagem natural
  |-> IA planeja analise, consulta dados, monta canvas
  |-> Revisar KPIs, graficos e tabelas gerados
  |-> Fazer perguntas de follow-up
  |-> Conversa e salva automaticamente para acesso futuro
```

### 4.5 Pontos de Entrada e Navegacao

- **Sidebar lateral:** Navegacao principal com 3 grupos (Carteira, Risco, Operacional) + Anexos + Admin
- **Modo colapsado:** Sidebar pode ser minimizada para icones
- **Tab Navegacao/Chat:** Sidebar alterna entre menu de navegacao e chat AI embutido
- **AppBar:** Cada pagina tem barra superior com filtros globais
- **Links de drill-down:** KPIs do dashboard linkam para paginas especificas
- **Breadcrumbs:** Anexos tem navegacao hierarquica
- **Botao "Analise Conversacional":** Destaque visual no topo do menu com icone de sparkles
- **Client Switcher:** Dropdown no topo da sidebar para alternar entre clientes, com cor e inicial de cada um. Persistencia de filtros ao trocar.
- **Bottom Tab Bar (Mobile):** Barra de navegacao inferior para telas pequenas com 4 tabs fixos (Inicio, Contratos, Pagamentos, Fluxo) + botao "Mais" que expande menu com todas as demais paginas. Respeita permissoes do usuario.

---

## 5. Funcionalidades Transversais

### 5.1 Sistema de Filtros Globais

Presente em todas as paginas (exceto Dashboard que usa versao simplificada):

| Filtro | Tipo | Descricao |
|---|---|---|
| **Data-Base (Range)** | Range de meses | Selecao de periodo inicio-fim com opcoes vindas do BigQuery |
| **Empreendimentos** | Multi-select | Filtra por projetos/empreendimentos especificos |
| **Rating** | Multi-select | Filtra por rating Liquid (A a H) |
| **Elegibilidade** | Multi-select | Elegivel / Nao Elegivel |
| **Faixa LTV** | Multi-select | 0-30%, 30-50%... ate >100% |
| **Faixa de Atraso** | Multi-select | Adimplente, 1-30, 31-60... > 180 |
| **Tipo Proponente** | Multi-select | PF / PJ |
| **Grupo de Repasse** | Multi-select | Grupo 1, 2, 3, 4 |

**Modo de Visualizacao:** `snapshot` (ultimo mes) ou `accumulated` (acumulado no periodo).

**Badge de contagem:** Numero de filtros ativos exibido no botao, com chips removiveis.

**Painel lateral (FilterPanel):** Abre como drawer com todas as opcoes organizadas por categoria.

### 5.2 Comparacao de Periodos

Funcionalidade disponivel em todas as paginas que aceitam filtros:

- Ativar "Comparar" seleciona automaticamente um periodo anterior correspondente
- **Na tabela:** DeltaBadge em cada celula mostrando variacao percentual (verde para positivo, vermelho para negativo, com inversao semantica quando "menos e melhor")
- **Nos graficos:** Barras/linhas fantasma (opacidade reduzida ou tracejado) representando o periodo anterior
- **Nos KPIs:** Badge de comparacao separado do trend historico

### 5.3 Exportacao

| Formato | Disponivel em | Mecanismo |
|---|---|---|
| **PDF** | Qualquer pagina via AI Chat (`generate_pdf`) | Puppeteer headless Chrome renderizando HTML com cores inlinadas |
| **CSV (Tabela)** | Detalhamento, Pagamentos, PDD, Repasse (marcados como `exportable`) | Geracao client-side de blob CSV |
| **CSV (IA)** | Via AI Chat (`generate_csv`) | Servidor gera arquivo e disponibiliza via URL temporaria |

### 5.4 Persistencia de Estado

- **Cliente ativo:** Salvo em `localStorage` (`liquid:activeClientId`)
- **Filtros por cliente:** Salvos no Zustand store ao trocar de cliente
- **Debug mode:** `localStorage` (`liquid:debugMode`)
- **Conversas do Explore:** Persistidas no Firestore com mensagens, blocos de canvas e filtros

### 5.5 Indicadores e KPIs

O sistema possui um **registro centralizado de indicadores** (`app-store.ts`) que serve dois propositos:

1. **Contexto para IA:** Todos os indicadores visiveis sao automaticamente serializados e enviados ao chat, permitindo que a IA "veja" o mesmo que o usuario.
2. **Controle de permissao:** Cada indicador tem um ID unico (ex: `dashboard.total_contratos`, `pdd.liquid_vs_bacen`) usado pelo sistema de permissoes para mostrar/ocultar granularmente.

Tipos de indicadores:
- **KPI:** Valor numerico com tendencia, sparkline e comparacao
- **Chart:** Grafico com metrica, dimensao e pontos de dados
- **Table:** Tabela com colunas e linhas

### 5.6 Alertas Visuais e Efeito Beam

KPI Cards possuem limiares configurados:
- Inadimplencia > 5%: alerta visual (borda vermelha com glow animado)
- Atraso > 90 dias > 1%: alerta
- Desagio Medio < -15%: alerta

**Efeito Beam (useBeamEffect):** KPI Cards possuem uma animacao de borda com gradiente conico rotativo (`conic-gradient`) que ativa ao hover ou quando em estado de alerta. No modo normal, a borda brilha em laranja (cor primaria). No modo alerta, brilha em vermelho. O efeito usa `requestAnimationFrame` para rotacao fluida a 60fps.

### 5.7 Glossario Integrado

Termos tecnicos exibem tooltips informativos (via `InfoTooltip`) vinculados ao glossario do sistema. O usuario pode hover/clicar em termos como "PDD", "LTV", "pro-soluto" para obter definicoes contextuais.

### 5.8 Atalhos de Teclado

Implementados via `useKeyboardShortcuts` para navegacao rapida.

### 5.9 Tema Visual

- **Modo escuro permanente** (sem toggle de tema)
- Paleta: Laranja (#F3A169) como cor primaria, Oliva (#576558) como secundaria
- Gradientes de cor semanticos: verde (baixo risco/adimplente) ate vermelho (alto risco/default)
- Fontes: Inter (corpo), Manrope (titulos), JetBrains Mono (codigo)

---

## 6. Glossario do Produto

Termos do dominio de securitizacao de credito imobiliario utilizados na plataforma:

| Termo | Definicao |
|---|---|
| **LTV** | Loan-to-Value: razao entre saldo devedor e valor do imovel. Acima de 90% indica risco elevado. |
| **PDD** | Provisao para Devedores Duvidosos: estimativa contabil de perda esperada na carteira. |
| **PDD Minima Bacen** | Provisao exigida pelo Bacen (Resolucao 2682), calculada por dias de atraso. |
| **PDD Liquid** | Provisao do modelo proprietario Liquid, baseada na probabilidade de inadimplencia do rating. |
| **Delta PDD** | Diferenca entre PDD Liquid e PDD Bacen. Indica risco adicional alem da exigencia regulatoria. |
| **Over 90** | Percentual de contratos com atraso > 90 dias. Indicador critico de inadimplencia cronica. |
| **Pro-Soluto** | Operacao em que o cedente retem o risco de inadimplencia, sem garantia de recompra pelo banco. |
| **Rating Liquid** | Classificacao de risco proprietaria (A = baixo risco, H = default). |
| **Desagio** | Percentual de desconto sobre valor nominal na precificacao. |
| **Safra** | Mes/ano de originacao do contrato. Usada para analise de cohort. |
| **Elegibilidade** | Classificacao quanto aos criterios para securitizacao ou repasse. |
| **Saldo Nominal** | Valor original dos contratos antes de correcao e amortizacoes. |
| **Saldo Devedor** | Valor atualizado da divida, considerando pagamentos e correcao. |
| **Inadimplencia** | Razao entre valor em atraso e saldo devedor total. |
| **Valor em Atraso** | Soma de parcelas vencidas e nao pagas. |
| **Faixa de Atraso** | Agrupamento por quantidade de dias em atraso. |
| **Correcao Monetaria** | Indice de correcao aplicado ao saldo (TR, IPCA, IGP-M, Taxa Fixa). |
| **Prazo Remanescente** | Meses restantes ate o vencimento. |
| **Covenant** | Clausula contratual com gatilhos de vencimento antecipado. |
| **Fluxo Esperado** | Projecao de recebiveis ajustada pela probabilidade de inadimplencia. |
| **Fluxo Contratado** | Soma de parcelas a vencer sem desconto por risco. |
| **Matriz de Cobranca** | Classificacao cruzada por perfil de cobranca e categoria de inadimplencia. |
| **Pricing** | Valor de mercado estimado (mark-to-model) descontado por taxa de desagio. |
| **Restricao** | Apontamento restritivo de credito (PEFIN, REFIN, protestos). |
| **Pagamento Antecipado** | Valor de parcelas pagas antes do vencimento. |
| **Recuperacao** | Valor recebido referente a parcelas que estavam inadimplentes. |
| **Grupos de Repasse** | Segmentacao (G1 a G8) por restricao, LTV e renda para estrategia de repasse. |
| **Renda Suficiente** | Renda familiar vs. comprometimento exigido pelo banco. |
| **LTV Banco** | LTV calculado conforme criterios bancarios para repasse. |
| **LTV Banco Stress** | LTV simulado com desvalorizacao de 10% do imovel. |
| **Perfil de Cobranca** | Classificacao por comprometimento de renda, restricoes e capacidade de pagamento. |
| **Faixa MCMV** | Faixa do Minha Casa Minha Vida determinada pela renda familiar. |
| **Stress Test** | Simulacao de cenario adverso para avaliar resiliencia da carteira. |
| **CPR** | Conditional Prepayment Rate: taxa condicional de pagamento antecipado. |
| **CDR** | Conditional Default Rate: taxa condicional de inadimplencia. |
| **WAL** | Weighted Average Life: vida media ponderada dos ativos. |
| **HHI** | Indice Herfindahl-Hirschman: medida de concentracao da carteira. |
| **ECL** | Expected Credit Loss: perda de credito esperada. |
| **LGD** | Loss Given Default: perda dada a inadimplencia. |
| **PD** | Probability of Default: probabilidade de inadimplencia. |

---

## 7. Oportunidades e Observacoes

### 7.1 Funcionalidades Parcialmente Implementadas

- **Matriz LTV Stress na Simulacao:** A tabela de migracao de LTV usa dados estaticos hard-coded (`ltvStressData`), nao conectados ao BigQuery. Oportunidade de tornar esta analise dinamica.
- **Dados mock de LTV x Atraso:** A pagina de Inadimplencia importa `ltvFaixaData` e `ltvFaixaAtrasoData` de mock, sugerindo que esta visualizacao ainda depende de dados estaticos para alguns clientes.
- **Benchmark na UI:** A API de benchmark esta funcional e e utilizada pelo agente de IA (`get_market_benchmarks`), mas nao ha pagina dedicada na interface para visualizacao de benchmarks -- os dados sao acessados apenas via chat AI.
- **Schema Detect:** O endpoint `/api/schema-detect` permite auto-deteccao de schema de datasets BigQuery, facilitando o onboarding de novos clientes no painel admin.

### 7.2 Gaps Identificados

- **Modo mobile da Analise Conversacional:** A pagina Explore exibe mensagem pedindo acesso desktop (min 1024px). Considerar versao simplificada mobile ou pelo menos manter o chat AI funcional.
- **Ausencia de notificacoes/alertas push:** O sistema mostra alertas visuais nos KPIs mas nao envia notificacoes por email ou webhook quando indicadores ultrapassam limiares.
- **Sem historico de acoes/auditoria:** Nao ha log de quem acessou qual dado ou quando -- relevante para compliance.
- **Exportacao PDF limitada:** Disponivel apenas via chat AI. Considerar botao de exportacao direto em cada pagina.

### 7.3 Sugestoes de Melhoria (Perspectiva de Produto)

1. **Dashboards personalizaveis:** Permitir que usuarios reordenem, ocultem ou fixem KPIs sem depender do admin.
2. **Alertas configurados pelo usuario:** Definir limiares customizados por indicador com notificacao por email.
3. **Comparacao entre clientes:** Para administradores, permitir visao comparativa cross-client.
4. **Onboarding guiado:** Primeiro acesso com tour interativo explicando os conceitos de securitizacao e as funcionalidades.
5. **Favoritos e atalhos:** Permitir que usuarios marquem paginas ou filtros frequentes como favoritos.
6. **Modo de impressao nativo:** Versao otimizada para impressao de qualquer pagina sem depender do chat AI.
7. **API publica / webhooks:** Permitir integracao com sistemas externos dos clientes para automacao de relatorios.
8. **Historico de conversas AI mais rico:** Adicionar tags, busca por conteudo dos blocos gerados e compartilhamento de analises entre usuarios.

### 7.4 Pontos Fortes do Produto

- **Profundidade de analise:** 10+ paginas de dashboard cobrindo todo o ciclo de vida de uma carteira securitizada, desde visao geral ate detalhamento contrato a contrato.
- **Sistema de IA sofisticado:** 8 agentes especializados com 47+ ferramentas, nao e um chatbot generico -- cada agente entende o dominio de securitizacao.
- **Canvas Orchestrator:** Capacidade unica de gerar dashboards inteiros via linguagem natural, com layout responsivo e persistencia.
- **Flexibilidade multi-cliente:** Schema customizavel por cliente significa que a plataforma se adapta ao dado do cliente, nao o contrario.
- **Comparacao temporal ubiqua:** Todas as paginas suportam comparacao de periodos de forma consistente e visualmente clara.
- **Controle de acesso granular:** Ate o nivel de indicador individual, com modos de negacao configurados, atendendo necessidades de compliance.

---

## 8. Fluxo de Dados (Tecnico)

### 8.1 Consulta de Dados (BigQuery)

```
[Pagina/Hook] -> fetchBigQuery(action, params)
  -> POST /api/bigquery { action, dataset, ...params }
    -> verifyAuthToken (Firebase)
    -> findClientByDataset (Firestore)
    -> canAccessDataset (permissoes)
    -> Resolve schema do cliente (campo mapping)
    -> Executa query BigQuery correspondente
    -> Retorna { data, unavailableFields }
  -> Hook atualiza estado local
  -> Componente renderiza dados
```

### 8.2 Chat AI

```
[AISidebar/ConversationSidebar] -> useChat (Vercel AI SDK)
  -> POST /api/chat { messages, dataset, filters, dashboardState, page }
    -> verifyAuthToken
    -> verifyDatasetAccess
    -> createOrchestrator (streamText com Vertex AI)
      -> Router model seleciona agente(s)
      -> Agente executa tools (SQL, calculos, APIs externas)
      -> Resultado streamed de volta
  -> UI renderiza incrementalmente (tool steps, markdown, dados inline)
```

### 8.3 Canvas Orchestrator (Explore)

```
[CanvasPanel] -> useChat com /api/canvas-chat
  -> POST /api/canvas-chat { messages, dataset, filters, pagesContext }
    -> createCanvasOrchestrator
      -> Reasoning model planeja analise
      -> plan_analysis -> declare_layout -> create_page
      -> query_data -> fill_block (x N blocos)
      -> Resultado streamed como tool calls
  -> canvasStore atualiza blocos incrementalmente
  -> Conversa salva no Firestore via useConversations
```
