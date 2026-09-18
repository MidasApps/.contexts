# Domain-Driven Context Framework (DDC)

> Estrutura de engenharia de contexto para potencializar IA em qualquer área da empresa.

---

## Metadados

| Campo | Valor |
|-------|-------|
| **Nome** | Domain-Driven Context Framework |
| **Sigla** | DDC |
| **Versão** | 1.0 |
| **Tipo** | Framework de Documentação e Engenharia de Contexto |
| **Aplicação** | Empresarial (multi-departamento) |
| **Público-alvo** | Equipes que usam IA como apoio operacional e estratégico |

---

## 1. Visão Geral

### 1.1 O que é o DDC

O **Domain-Driven Context Framework (DDC)** é uma estrutura de documentação projetada para organizar o conhecimento de uma empresa em **domínios bem definidos**, de forma que assistentes de IA (LLMs) possam:

- Entender o contexto completo da operação
- Tomar decisões informadas e alinhadas
- Gerar entregas consistentes com os padrões da empresa
- Reduzir alucinações e improvisações

### 1.2 Princípio Central

> **A IA não lê mentes. Ela lê documentação.**
>
> Quanto mais estruturado e completo for o contexto fornecido, mais consistente, alinhado e útil será o resultado gerado.

### 1.3 Diferencial

Diferente de frameworks de documentação tradicionais, o DDC é:

- **AI-First**: estruturado para consumo por LLMs
- **Multi-departamento**: vai além de engenharia
- **Iterativo**: cresce com a empresa
- **Padronizado**: garante consistência entre áreas
- **Acionável**: cada documento gera output direto

---

## 2. Arquitetura do Framework

O DDC organiza o conhecimento em **4 camadas de domínio**:

```
┌─────────────────────────────────────────────┐
│  1. NEGÓCIO    →  O "porquê" da empresa    │
├─────────────────────────────────────────────┤
│  2. PRODUTO    →  O "o quê" será entregue  │
├─────────────────────────────────────────────┤
│  3. ENGENHARIA →  O "como" será construído │
├─────────────────────────────────────────────┤
│  4. OPERAÇÕES  →  O "quando e onde" executar│
└─────────────────────────────────────────────┘
```

Cada camada é independente, mas se conecta às demais através de referências cruzadas.

---

## 3. Camada 1: NEGÓCIO

**Pergunta central:** Por quê?

**Responsável:** Liderança executiva, founders, C-level.

**Diretório sugerido:** `/business`

### 3.1 Conteúdos

#### 3.1.1 Visão & Estratégia (`vision.md`)

Define a direção macro da empresa.

**Documentar:**
- Missão da empresa
- Visão de futuro (5-10 anos)
- Valores organizacionais
- Proposta de valor única (USP)
- Posicionamento de mercado
- Diferenciais competitivos
- Metas de curto, médio e longo prazo

**Template mínimo:**
```markdown
# Visão & Estratégia

## Missão
[Por que a empresa existe?]

## Visão
[Onde queremos chegar?]

## Valores
- [Valor 1]: [descrição]
- [Valor 2]: [descrição]

## Proposta de Valor
[O que entregamos de único?]

## Diferenciais Competitivos
1. [Diferencial 1]
2. [Diferencial 2]
```

#### 3.1.2 Modelo de Negócio (`model.md`)

Define como a empresa gera receita.

**Documentar:**
- Estrutura de planos (Free, Starter, Pro, Enterprise)
- Lógica de precificação
- Modelo de cobrança (mensal, anual, por uso)
- Estratégias de upsell e cross-sell
- Políticas de trial e freemium
- Margem e estrutura de custos

#### 3.1.3 Métricas (`metrics.md`)

KPIs que medem o sucesso do negócio.

**Documentar:**
- MRR (Monthly Recurring Revenue)
- ARR (Annual Recurring Revenue)
- Churn rate (receita e clientes)
- LTV (Lifetime Value)
- CAC (Custo de Aquisição de Cliente)
- NPS / CSAT
- Expansion revenue
- Metas e benchmarks por métrica

#### 3.1.4 Mercado (`market.md`)

Contexto externo da empresa.

**Documentar:**
- ICP (Perfil de Cliente Ideal)
- Segmentos-alvo
- TAM, SAM, SOM
- Análise de concorrentes
- Tendências do setor
- Ameaças e oportunidades

#### 3.1.5 Glossário (`glossary.md`)

Linguagem padrão da empresa.

**Documentar:**
- Termos do negócio
- Definições internas
- Siglas e abreviações
- Termos técnicos relevantes
- Termos do setor

#### 3.1.6 Restrições & Compliance (`constraints.md`)

Limites legais e regulatórios.

**Documentar:**
- Regulamentações aplicáveis (LGPD, GDPR, SOC2, HIPAA)
- Políticas de privacidade
- Termos de uso
- Restrições legais do setor
- SLAs contratuais
- Auditorias e certificações

---

## 4. Camada 2: PRODUTO

**Pergunta central:** O quê?

**Responsável:** Product Managers, Designers, Pesquisadores.

**Diretório sugerido:** `/product`

### 4.1 Conteúdos

#### 4.1.1 Visão do Produto (`overview.md`)

Define o propósito do produto.

**Documentar:**
- Propósito do produto
- Problema central que resolve
- Jobs to be Done (JTBD)
- Princípios de produto
- Norte de longo prazo
- Não-objetivos (o que o produto NÃO faz)

#### 4.1.2 Personas (`users/personas.md`)

Quem usa o produto.

**Documentar:**
- Perfis de usuários
- Dores e necessidades
- Objetivos e motivações
- Comportamentos e contextos de uso
- Nível de maturidade técnica
- Decisores vs. usuários finais

**Template por persona:**
```markdown
## Persona: [Nome]

**Cargo/Papel:** 
**Empresa típica:** 
**Maturidade técnica:** 

### Dores
- [Dor 1]
- [Dor 2]

### Objetivos
- [Objetivo 1]
- [Objetivo 2]

### Contexto de uso
[Quando, onde e como usa o produto]
```

#### 4.1.3 Jornadas (`users/journeys.md`)

Como o usuário interage com o produto.

**Documentar:**
- Fluxos principais (core flows)
- Onboarding e ativação
- Momentos de valor (aha moments)
- Pontos de fricção conhecidos
- Jornada de upgrade/expansão
- Jornadas por persona

#### 4.1.4 Features (`features/`)

Catálogo de funcionalidades.

**Estrutura por feature:**
```
/features/[feature-name]/
├── spec.md           # Especificação técnica
├── flows.md          # Fluxos e telas
├── rules.md          # Regras de negócio
└── examples.md       # Exemplos e edge cases
```

**Template de spec:**
```markdown
# Feature: [Nome]

## Objetivo
[Por que essa feature existe?]

## User Stories
- Como [persona], quero [ação], para [benefício]

## Critérios de Aceitação
- [ ] [Critério 1]
- [ ] [Critério 2]

## Regras de Negócio
1. [Regra 1]
2. [Regra 2]

## Edge Cases
- [Caso 1]: [comportamento esperado]
```

#### 4.1.5 Roadmap (`roadmap.md`)

Direção do produto.

**Documentar:**
- Prioridades atuais (Now)
- Próximos passos (Next)
- Visão futura (Later)
- Backlog estratégico
- Apostas e experimentos
- Débitos de produto
- Dependências entre features

#### 4.1.6 Estrutura de Planos (`plans.md`)

O que cada plano oferece.

**Documentar:**
- O que cada plano inclui
- Limites e quotas (usuários, storage, requests)
- Feature flags por plano
- Lógica de upgrade/downgrade
- Restrições de trial
- Add-ons disponíveis

#### 4.1.7 UX & Design (`design/`)

Linguagem visual e de interação.

**Documentar:**
- Princípios de design
- Tom de voz no produto
- Padrões de interface (design system)
- Microcopies e mensagens de erro
- Padrões de acessibilidade
- Componentes reutilizáveis

---

## 5. Camada 3: ENGENHARIA

**Pergunta central:** Como?

**Responsável:** Tech Leads, Arquitetos, Desenvolvedores.

**Diretório sugerido:** `/engineering`

### 5.1 Conteúdos

#### 5.1.1 Arquitetura (`architecture/`)

Visão técnica do sistema.

**Documentar:**
- Visão geral do sistema
- Diagramas de arquitetura (C4, fluxos)
- Serviços e responsabilidades
- Comunicação entre serviços
- Decisões arquiteturais (ADRs)
- Constraints técnicos

#### 5.1.2 Stack Tecnológica (`stack.md`)

Tecnologias usadas.

**Documentar:**
- Linguagens e frameworks
- Bancos de dados (relacional, NoSQL, cache)
- Infraestrutura (cloud, containers, serverless)
- Ferramentas de CI/CD
- Serviços terceiros (auth, pagamento, email)
- Versões e razões da escolha

#### 5.1.3 Padrões de Código (`standards/`)

Como escrevemos código.

**Documentar:**
- Convenções de nomenclatura
- Estrutura de pastas
- Padrões de projeto utilizados
- Tratamento de erros
- Logging e observabilidade
- Comentários e documentação inline
- Linters e formatters

#### 5.1.4 APIs (`api-patterns.md`)

Padrões de interface.

**Documentar:**
- Contratos de API (endpoints, métodos)
- Padrões de request/response
- Autenticação e autorização
- Versionamento
- Rate limiting e throttling
- Códigos de erro padronizados
- Documentação (OpenAPI/Swagger)

#### 5.1.5 Dados (`data/`)

Como dados são tratados.

**Documentar:**
- Modelagem de dados
- Schemas e migrações
- Pipelines de dados (ETL/ELT)
- Data warehouse / data lake
- Políticas de retenção
- Backup e recovery
- LGPD e dados sensíveis

#### 5.1.6 Segurança (`security.md`)

Práticas de segurança.

**Documentar:**
- Práticas de segurança (OWASP Top 10)
- Gestão de secrets
- Criptografia (em trânsito, em repouso)
- Controle de acesso (RBAC, permissões)
- Auditoria e logs de segurança
- Resposta a vulnerabilidades

#### 5.1.7 Integrações (`integrations/`)

Conexões externas.

**Documentar:**
- Serviços externos conectados
- Webhooks (entrada e saída)
- Filas e mensageria
- APIs de terceiros
- Fallbacks e circuit breakers
- Tratamento de falhas

#### 5.1.8 Testes (`testing.md`)

Estratégia de testes.

**Documentar:**
- Estratégia de testes (unitário, integração, e2e)
- Cobertura mínima esperada
- Ferramentas de teste
- Ambientes de teste
- Dados de teste (fixtures, mocks)
- Testes de performance e carga

---

## 6. Camada 4: OPERAÇÕES

**Pergunta central:** Quando e onde?

**Responsável:** Heads de área, Ops, Líderes operacionais.

**Diretório sugerido:** `/operations`

### 6.1 Conteúdos

#### 6.1.1 Processos por Departamento (`departments/`)

Como cada área executa.

**Marketing (`departments/marketing.md`):**
- Fluxo de criação de campanhas
- Calendário editorial
- Aprovações de conteúdo
- Ferramentas (CRM, automação, analytics)
- Rituais e cadências do time
- Métricas de performance

**Vendas (`departments/sales.md`):**
- Pipeline e estágios do funil
- Processo de qualificação (MQL → SQL → Oportunidade)
- Cadência de follow-up
- Handoff entre SDR e Closer
- Ferramentas (CRM, contratos, propostas)
- Política de descontos

**Produto (`departments/product.md`):**
- Discovery e priorização
- Rituais (sprint planning, review, retro)
- Handoff produto → engenharia
- Processo de lançamento de features
- Ferramentas (Jira, Linear, Figma)
- Gestão de feedback

**Engenharia (`departments/engineering.md`):**
- Fluxo de desenvolvimento (Git flow, trunk-based)
- Code review e aprovações
- CI/CD e deploy
- On-call e resposta a incidentes
- Ferramentas (GitHub, pipelines, monitoramento)
- Gestão de débito técnico

**Jurídico (`departments/legal.md`):**
- Fluxo de revisão de contratos
- Aprovações e assinaturas
- Prazos e SLAs internos
- Gestão de compliance
- Ferramentas (CLM, assinatura digital)
- Templates contratuais

#### 6.1.2 Handoffs (`handoffs.md`)

Transições entre áreas.

**Documentar:**
- Marketing → Vendas (lead qualificado)
- Vendas → Sucesso/Produto (cliente fechado)
- Produto → Engenharia (spec pronta)
- Jurídico → Vendas (contrato aprovado)
- Critérios de qualidade em cada handoff
- Responsáveis e SLAs

#### 6.1.3 SLAs Internos (`slas.md`)

Compromissos entre áreas.

**Documentar:**
- Tempo de resposta entre áreas
- Prazos de entrega por tipo de demanda
- Escalonamento interno
- Penalidades e ajustes

#### 6.1.4 Ferramentas (`tools.md`)

Stack operacional.

**Documentar:**
- Stack de ferramentas por área
- Integrações entre sistemas
- Automações (Zapier, Make, n8n)
- Acessos e permissões
- Custos e renovações

#### 6.1.5 Rituais (`rituals.md`)

Cadências da empresa.

**Documentar:**
- Reuniões recorrentes (all-hands, 1:1, weeklies)
- Reports e check-ins
- OKRs e acompanhamento
- Reviews trimestrais
- Planejamento anual

#### 6.1.6 Infraestrutura & Deploy (`infrastructure.md`)

Operações técnicas.

**Documentar:**
- Ambientes (dev, staging, prod)
- Configuração e variáveis de ambiente
- Processo de deploy
- Estratégias (blue-green, canary, rolling)
- Rollback e recovery
- Janelas de manutenção

#### 6.1.7 Monitoramento (`monitoring.md`)

Observabilidade.

**Documentar:**
- Métricas de infraestrutura e aplicação
- Alertas e thresholds
- Dashboards principais
- Ferramentas (Datadog, Grafana, CloudWatch)
- Retenção de logs

#### 6.1.8 Incidentes (`incidents.md`)

Resposta a problemas.

**Documentar:**
- Classificação de severidade (P1, P2, P3)
- Processo de resposta a incidentes
- Escalonamento e on-call
- Comunicação durante incidentes
- Post-mortem e RCA (Root Cause Analysis)

---

## 7. Diretório Auxiliar: DECISÕES

**Diretório sugerido:** `/decisions`

Armazena **Architecture Decision Records (ADRs)** organizados por contexto.

### 7.1 Estrutura

```
/decisions/
├── business/      # Decisões de negócio
├── product/       # Decisões de produto
└── technical/     # Decisões técnicas
```

### 7.2 Template de ADR

```markdown
# ADR-[NÚMERO]: [Título]

**Data:** YYYY-MM-DD
**Status:** [Proposto | Aceito | Rejeitado | Substituído]
**Contexto:** [Business | Product | Technical]

## Contexto
[Qual é o problema ou situação?]

## Decisão
[O que foi decidido?]

## Consequências
[Quais são os impactos positivos e negativos?]

## Alternativas Consideradas
- [Alternativa 1]: [por que não foi escolhida]
- [Alternativa 2]: [por que não foi escolhida]
```

---

## 8. Engenharia de Contexto para IA

### 8.1 Como Estruturar para LLMs

#### Princípios

1. **Hierarquia clara**: use markdown com headings consistentes (H1 → H6)
2. **Metadados explícitos**: tabelas, frontmatter, tags
3. **Exemplos concretos**: code blocks, snippets, casos reais
4. **Referências cruzadas**: links entre documentos relacionados
5. **Atualização versionada**: data e versão em cada documento
6. **Linguagem direta**: evite ambiguidade, seja específico

#### Estrutura Recomendada por Documento

```markdown
# [Título do Documento]

> [Resumo em uma linha]

## Metadados
| Campo | Valor |
|-------|-------|
| Versão | 1.0 |
| Atualizado em | YYYY-MM-DD |
| Responsável | [Nome/Área] |
| Camada DDC | [Negócio/Produto/Engenharia/Operações] |

## Contexto
[Por que esse documento existe]

## Conteúdo
[Informação principal estruturada]

## Exemplos
[Casos práticos]

## Referências
- [Link para documento relacionado]
```

### 8.2 Como Usar o DDC com IA

#### Fluxo Recomendado

```
1. IDENTIFIQUE A CAMADA RELEVANTE
   ↓
2. CARREGUE OS CONTEXTOS NECESSÁRIOS
   ↓
3. REFERENCIE EXPLICITAMENTE NO PROMPT
   ↓
4. SOLICITE A TAREFA
   ↓
5. VALIDE CONTRA OS PADRÕES DOCUMENTADOS
```

#### Exemplos de Prompts Contextualizados

**Para Marketing:**
```
Contexto: /business/vision.md, /product/personas.md, /operations/departments/marketing.md

Tarefa: Crie 3 variações de copy para campanha de aquisição da persona [X], 
seguindo o tom de voz definido e a proposta de valor da empresa.
```

**Para Engenharia:**
```
Contexto: /engineering/api-patterns.md, /engineering/standards/, /product/features/auth/spec.md

Tarefa: Implemente o endpoint de autenticação seguindo nossos padrões de API 
e os critérios de aceitação da spec.
```

**Para Vendas:**
```
Contexto: /business/model.md, /product/personas.md, /operations/departments/sales.md

Tarefa: Construa um script de descoberta para a persona [X], 
respeitando nosso pipeline e política de descontos.
```

### 8.3 Boas Práticas

#### ✅ FAZER

- Manter documentos atualizados (revisão trimestral mínima)
- Usar exemplos reais sempre que possível
- Versionar grandes mudanças
- Linkar documentos relacionados
- Definir responsável por cada documento
- Usar templates consistentes

#### ❌ EVITAR

- Documentos longos demais (quebrar em partes)
- Informação duplicada entre camadas
- Linguagem vaga ou ambígua
- Contexto desatualizado
- Documentos sem responsável
- Misturar camadas no mesmo documento

---

## 9. Aplicação por Departamento

Cada área usa combinações específicas das camadas:

| Área | Camadas Principais | Casos de Uso com IA |
|------|--------------------|--------------------|
| **Marketing** | Negócio + Produto + Operações | Copy, campanhas, conteúdo, análise |
| **Vendas** | Negócio + Produto + Operações | Scripts, follow-ups, propostas, objeções |
| **Produto** | Negócio + Produto + Engenharia | Specs, pesquisa, priorização |
| **Engenharia** | Produto + Engenharia + Operações | Código, testes, documentação técnica |
| **Jurídico** | Negócio + Operações | Contratos, compliance, revisões |
| **Suporte** | Produto + Operações | Respostas, escalonamento, FAQ |
| **Sucesso** | Produto + Negócio + Operações | Onboarding, retenção, expansão |

---

## 10. Roteiro de Implementação

### Fase 1: Fundação (Semana 1-2)
- [ ] Criar estrutura de diretórios
- [ ] Documentar Camada 1 (Negócio) básica
- [ ] Definir responsáveis por cada camada
- [ ] Escolher ferramenta de armazenamento (GitHub, Notion, Confluence)

### Fase 2: Produto (Semana 3-4)
- [ ] Documentar personas principais
- [ ] Mapear jornadas core
- [ ] Criar template de features
- [ ] Documentar 3-5 features principais

### Fase 3: Engenharia (Semana 5-6)
- [ ] Documentar arquitetura atual
- [ ] Formalizar padrões de código
- [ ] Catalogar APIs e integrações
- [ ] Criar primeiros ADRs

### Fase 4: Operações (Semana 7-8)
- [ ] Mapear processos por área
- [ ] Documentar handoffs críticos
- [ ] Definir SLAs internos
- [ ] Catalogar ferramentas e rituais

### Fase 5: Integração com IA (Semana 9+)
- [ ] Treinar equipe no uso de prompts contextualizados
- [ ] Criar prompts-padrão por área
- [ ] Estabelecer rituais de atualização da documentação
- [ ] Medir impacto (tempo economizado, qualidade)

---

## 11. Regras para a IA Consumir o DDC

> Estas regras devem ser fornecidas como **system prompt** ou contexto inicial para a IA.

```markdown
# Regras de Consumo do DDC

Ao receber documentação do Domain-Driven Context Framework como contexto:

1. **Identifique a camada relevante** antes de gerar qualquer resposta
2. **Respeite a hierarquia**: Negócio define o "porquê", Produto o "o quê", 
   Engenharia o "como", Operações o "quando/onde"
3. **Mantenha consistência** com o tom de voz, padrões e regras documentadas
4. **Não invente informações** que não estão documentadas — sinalize gaps
5. **Pergunte quando houver conflito** entre camadas ou ambiguidade
6. **Cite o documento de referência** quando aplicar uma regra ou padrão
7. **Sugira atualizações** na documentação quando identificar lacunas
8. **Priorize a camada mais específica**: se houver conflito, Operações > 
   Engenharia > Produto > Negócio (do mais tático ao mais estratégico)
9. **Use exemplos da documentação** sempre que possível
10. **Valide entregas** contra os critérios de aceitação documentados
```

---

## 12. Benefícios Esperados

### Para a Empresa
- Conhecimento institucional preservado
- Onboarding acelerado (humanos e IAs)
- Consistência operacional
- Redução de retrabalho
- Decisões rastreáveis

### Para a IA
- Contexto rico e estruturado
- Menos alucinações
- Output alinhado aos padrões
- Capacidade de raciocínio multi-domínio
- Sugestões mais precisas

### Para os Times
- Clareza de responsabilidades
- Menos dependência de pessoas específicas
- Processos padronizados
- Autonomia com qualidade

---

## 13. Analogia Final

> Pense no DDC como o **Manual Completo de Construção** de um arranha-céu:
>
> - **Negócio** = o que o edifício deve alcançar e para quem
> - **Produto** = os desenhos detalhados de cada andar
> - **Engenharia** = as normas técnicas e materiais
> - **Operações** = o cronograma e protocolos do canteiro
>
> A IA atua como uma equipe de construção altamente capacitada que pode trabalhar de forma autônoma e consistente — **porque tem acesso instantâneo a todas as plantas e regras documentadas**.

---

## 14. Próximos Passos

1. **Avalie** o estado atual da documentação da sua empresa
2. **Escolha** uma camada para começar (recomendação: Negócio)
3. **Implemente** os templates mínimos
4. **Teste** com casos reais de uso de IA
5. **Itere** baseado em resultados
6. **Expanda** para as demais camadas

---

## Apêndice A: Checklist de Documentação

### Negócio
- [ ] Visão & Estratégia
- [ ] Modelo de Negócio
- [ ] Métricas (KPIs)
- [ ] Mercado e Concorrência
- [ ] Glossário
- [ ] Restrições & Compliance

### Produto
- [ ] Visão do Produto
- [ ] Personas
- [ ] Jornadas
- [ ] Catálogo de Features
- [ ] Roadmap
- [ ] Estrutura de Planos
- [ ] UX & Design System

### Engenharia
- [ ] Arquitetura
- [ ] Stack Tecnológica
- [ ] Padrões de Código
- [ ] APIs
- [ ] Dados
- [ ] Segurança
- [ ] Integrações
- [ ] Testes

### Operações
- [ ] Processos por Departamento
- [ ] Handoffs
- [ ] SLAs Internos
- [ ] Ferramentas
- [ ] Rituais
- [ ] Infraestrutura & Deploy
- [ ] Monitoramento
- [ ] Incidentes

### Decisões
- [ ] ADRs de Negócio
- [ ] ADRs de Produto
- [ ] ADRs Técnicos

---

## Apêndice B: Estrutura Completa de Diretórios

```
/ddc-docs/
├── README.md                         # Visão geral e navegação
├── AI-GUIDE.md                       # Instruções específicas para IA
│
├── business/
│   ├── vision.md
│   ├── model.md
│   ├── metrics.md
│   ├── market.md
│   ├── glossary.md
│   └── constraints.md
│
├── product/
│   ├── overview.md
│   ├── roadmap.md
│   ├── plans.md
│   ├── users/
│   │   ├── personas.md
│   │   ├── journeys.md
│   │   └── problems.md
│   ├── features/
│   │   ├── _template/
│   │   │   ├── spec.md
│   │   │   ├── flows.md
│   │   │   ├── rules.md
│   │   │   └── examples.md
│   │   └── [feature-name]/
│   └── design/
│       ├── principles.md
│       ├── tone-of-voice.md
│       └── design-system.md
│
├── engineering/
│   ├── architecture/
│   │   ├── overview.md
│   │   └── diagrams/
│   ├── stack.md
│   ├── standards/
│   │   ├── code.md
│   │   ├── naming.md
│   │   └── errors.md
│   ├── api-patterns.md
│   ├── data/
│   │   ├── modeling.md
│   │   └── pipelines.md
│   ├── security.md
│   ├── integrations/
│   └── testing.md
│
├── operations/
│   ├── departments/
│   │   ├── marketing.md
│   │   ├── sales.md
│   │   ├── product.md
│   │   ├── engineering.md
│   │   └── legal.md
│   ├── handoffs.md
│   ├── slas.md
│   ├── tools.md
│   ├── rituals.md
│   ├── infrastructure.md
│   ├── monitoring.md
│   └── incidents.md
│
└── decisions/
    ├── business/
    ├── product/
    └── technical/
```

---

**Versão deste documento:** 1.0
**Última atualização:** 2026-05-18
**Licença:** Uso livre com atribuição

---

*"A melhor documentação é aquela que faz seu time — humano e artificial — pensar e agir como uma só empresa."*
