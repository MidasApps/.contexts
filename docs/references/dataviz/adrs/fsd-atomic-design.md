# Arquitetura SaaS B2B com Next.js: FSD, Atomic Design e monorepo em 2025

A combinação de **Feature-Sliced Design (FSD) + Atomic Design + Clean Architecture em monorepo Turborepo/pnpm** emergiu como o padrão de referência para projetos SaaS B2B complexos com Next.js 14/15. A abordagem resolve o problema central de escalabilidade: manter centenas de componentes, features e rotas organizados sem que o projeto se torne innavegável. O FSD governa a macro-arquitetura (como módulos se relacionam), o Atomic Design governa a micro-arquitetura do design system (como componentes visuais se compõem), e a Clean Architecture isola a lógica de negócio do framework. Este relatório documenta as estruturas de pastas consolidadas, regras de dependência, convenções de nomenclatura e trade-offs concretos de cada abordagem.

---

## 1. Feature-Sliced Design no Next.js App Router

O FSD v2.1 (versão estável atual) organiza o frontend em **seis camadas hierárquicas** com fluxo de dependência estritamente unidirecional — camadas superiores importam das inferiores, nunca o contrário.

| Camada | Responsabilidade | Contém slices? | Pode importar de |
|---|---|---|---|
| **app** | Inicialização: providers, estilos globais, entry point | Não (segmentos diretos) | Todas abaixo |
| **pages** | Páginas completas, composição de widgets/features | Sim | widgets, features, entities, shared |
| **widgets** | Blocos de UI autônomos e compostos | Sim | features, entities, shared |
| **features** | Ações de usuário com valor de negócio (login, add-to-cart) | Sim | entities, shared |
| **entities** | Modelos de domínio (user, product, invoice) + UI própria | Sim | shared (+ @x para cross-refs) |
| **shared** | Código reutilizável sem lógica de negócio: UI kit, utils, API client | Não (segmentos diretos) | Apenas si mesmo |

Cada slice contém **segmentos padronizados**: `ui/` (componentes), `model/` (schemas, stores, tipos), `api/` (chamadas ao backend), `lib/` (helpers) e `config/` (constantes). A camada **processes foi deprecada** no v2.1 — sua lógica migra para features ou app. A notação **@x** permite cross-imports controlados entre entities quando necessário (ex: entity `song` expõe tipos específicos para entity `artist`).

### Integração com App Router: o padrão re-export

O conflito fundamental é que o Next.js exige arquivos em `app/` para roteamento baseado em filesystem, enquanto o FSD quer sua própria camada `pages/`. A solução oficial mantém o diretório `app/` do Next.js como **camada fina de roteamento** que re-exporta componentes do FSD:

```
├── app/                              # Next.js App Router (routing only)
│   ├── dashboard/
│   │   └── page.tsx                  # export { DashboardPage as default } from '@/pages/dashboard'
│   ├── api/
│   │   └── users/
│   │       └── route.ts             # Re-exporta de src/app/api-routes
│   ├── layout.tsx
│   └── not-found.tsx
├── pages/                            # VAZIO (impede conflito com Pages Router)
│   └── README.md
├── src/
│   ├── app/                          # FSD: app layer
│   │   ├── providers/
│   │   └── api-routes/
│   ├── pages/                        # FSD: pages layer
│   │   └── dashboard/
│   │       ├── ui/
│   │       │   └── DashboardPage.tsx
│   │       └── index.ts
│   ├── widgets/
│   │   └── header/
│   │       ├── ui/
│   │       │   └── Header.tsx
│   │       └── index.ts
│   ├── features/
│   │   └── create-invoice/
│   │       ├── ui/
│   │       │   └── CreateInvoiceForm.tsx
│   │       ├── model/
│   │       │   ├── schema.ts
│   │       │   └── useCreateInvoice.ts
│   │       ├── api/
│   │       │   └── createInvoice.action.ts
│   │       └── index.ts
│   ├── entities/
│   │   └── invoice/
│   │       ├── ui/
│   │       │   └── InvoiceCard.tsx
│   │       ├── model/
│   │       │   └── types.ts
│   │       └── index.ts
│   └── shared/
│       ├── ui/
│       ├── lib/
│       ├── api/
│       └── config/
```

**Detalhe crítico**: a pasta `pages/` vazia na raiz é obrigatória — sem ela, o Next.js interpreta `src/pages` como Pages Router e quebra o build. O `middleware.ts` deve ficar na raiz do projeto. Uma abordagem alternativa mais pragmática elimina a camada `pages/` do FSD e usa o `app/` do Next.js diretamente como camada de composição, importando widgets/features/entities. Isso reduz boilerplate de re-exports às custas de menor pureza FSD.

### Server Components e Client Components no FSD

O padrão recomendado: **Server Components por padrão** em todas as camadas. A diretiva `"use client"` aparece apenas em componentes de `features/` e `widgets/` que precisam de interatividade. Routes em `app/` ficam mínimas: `return <DashboardPage />`. Server Components fazem leitura de dados; Client Components controlam interatividade. Dados ficam em `entities/*/api/`.

---

## 2. Atomic Design mora dentro do `shared/ui` do FSD

O consenso da comunidade em 2024-2025 é claro: **Atomic Design funciona como taxonomia de UI dentro da camada `shared/ui`** do FSD, não como arquitetura concorrente. Os cinco níveis de Brad Frost (atoms, molecules, organisms, templates, pages) classificam componentes visuais por complexidade, enquanto FSD classifica módulos por responsabilidade de negócio. São complementares quando usados nos lugares corretos.

A documentação oficial do FSD explicita: "Atoms e molecules podem ser implementados em `shared/ui`, simplificando reuso e manutenção de elementos de UI básicos." A frase-chave que resolve a tensão: **"Atomic Design é taxonomia. FSD é topologia."**

### Onde cada nível do Atomic Design vive

```
src/shared/ui/                    # Atomic Design hierarchy (business-agnostic)
├── atoms/
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.test.tsx
│   │   └── index.ts
│   ├── Input/
│   ├── Icon/
│   ├── Badge/
│   └── Spinner/
├── molecules/
│   ├── FormField/                # Label + Input + HelperText
│   ├── SearchInput/              # Input + Icon + clear
│   ├── DropdownMenu/
│   └── Pagination/
├── organisms/
│   ├── Modal/                    # APENAS organismos genéricos
│   ├── DataTable/
│   └── NavBar/
└── templates/
    ├── MainLayout/
    ├── AuthLayout/
    └── DashboardLayout/
```

**Organismos domain-specific** (como `LoginForm`, `InvoiceTable`) **não ficam em `shared/ui`** — eles pertencem a `features/*/ui` ou `entities/*/ui`, porque carregam lógica de negócio. Essa é a regra que elimina conflito entre os dois padrões.

### Resolvendo os quatro conflitos conhecidos

**Conflito 1 — ambos têm "pages"**: as pages do Atomic Design (templates preenchidos com dados reais) mapeiam para a camada `pages/` do FSD. No Next.js, o `app/` directory assume esse papel de roteamento, tornando a distinção irrelevante na prática.

**Conflito 2 — ambos organizam componentes**: Atomic Design organiza por **complexidade visual** (átomo → organismo), FSD organiza por **domínio de negócio** (shared → features). A separação é: genérico em `shared/ui/` com Atomic Design, específico de negócio no slice FSD correspondente.

**Conflito 3 — organismos viram "God components"**: o sistema de segmentos do FSD (`ui/`, `model/`, `api/`) força separação natural. Organismos complexos com lógica de negócio viram `widgets/` no FSD.

**Conflito 4 — onde fica lógica de negócio**: Atomic Design não tem resposta para isso. FSD resolve completamente: `entities/*/model` para modelos de domínio, `features/*/model` para lógica de feature, `shared/lib` para utilitários puros.

### Estrutura combinada em monorepo

Quando o design system é compartilhado entre apps, a camada Atomic Design migra para `packages/ui/`:

```
packages/
└── ui/                           # Design system package (@repo/ui)
    └── src/
        ├── atoms/
        ├── molecules/
        ├── organisms/
        ├── tokens/
        │   ├── colors.ts
        │   └── spacing.ts
        └── index.ts

apps/web/src/
├── shared/ui/                    # UI específica do app (pode importar @repo/ui)
├── entities/
├── features/
└── widgets/
```

---

## 3. Backend com API Routes: Clean Architecture adaptada

O princípio central para backend em Next.js é **route handlers finos** — eles parseiam a request, chamam um use case, e formatam a response. Toda lógica de negócio vive em camadas internas. Isso se alinha com Clean Architecture e Hexagonal Architecture.

### Mapeamento de camadas

| Clean Architecture | Next.js | Localização |
|---|---|---|
| Controllers | Route Handlers / Server Actions | `app/api/*/route.ts` |
| Use Cases | Application Services | `packages/application/use-cases/` |
| Repository Interfaces | Ports (domain) | `packages/domain/repositories/` |
| Repository Implementations | Adapters (infra) | `packages/infrastructure/repositories/` |
| Domain Entities | Zod schemas + TS types | `packages/domain/entities/` |

### Estrutura recomendada para SaaS B2B

```
apps/web/src/
├── app/
│   └── api/
│       ├── v1/
│       │   ├── users/
│       │   │   └── route.ts         # Thin handler → chama use case
│       │   └── invoices/
│       │       ├── route.ts
│       │       └── [id]/route.ts
│       └── webhooks/
│           └── stripe/route.ts

packages/
├── domain/                           # ZERO dependências externas
│   ├── entities/
│   │   ├── User.ts                  # Zod schema + export type User = z.infer<typeof UserSchema>
│   │   ├── Invoice.ts
│   │   └── Tenant.ts
│   ├── repositories/                # Interfaces (ports)
│   │   ├── IUserRepository.ts
│   │   └── IInvoiceRepository.ts
│   ├── services/                    # Regras de negócio puras
│   │   └── BillingRules.ts
│   └── value-objects/
│       ├── Email.ts
│       └── Money.ts
├── application/                     # Use cases (orquestração)
│   ├── use-cases/
│   │   ├── CreateInvoice.ts
│   │   ├── InviteTeamMember.ts
│   │   └── ProcessSubscription.ts
│   └── dto/
│       ├── CreateInvoiceInput.ts
│       └── InvoiceOutput.ts
├── infrastructure/                  # Adapters (implementações concretas)
│   ├── repositories/
│   │   ├── PrismaUserRepository.ts
│   │   └── DrizzleInvoiceRepository.ts
│   ├── services/
│   │   ├── StripePaymentService.ts
│   │   └── ResendEmailService.ts
│   └── db/
│       ├── schema.prisma
│       └── client.ts
```

### Fluxo de dados

```
HTTP Request → route.ts (parse + validate) → Use Case → Domain Service → Repository Interface
                                                                              ↓
                                               PrismaRepository (adapter) → Database
```

O **route handler** exemplar:

```typescript
// app/api/v1/invoices/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { CreateInvoiceInput } from '@repo/application/dto';
import { createInvoice } from '@repo/application/use-cases';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const input = CreateInvoiceInput.parse(body);  // Zod validation
  const result = await createInvoice(input);
  return NextResponse.json(result, { status: 201 });
}
```

### Padrão emergente: Hono dentro do Next.js

Uma tendência forte em 2025 é usar **Hono** como camada de API dentro do catch-all route handler, ganhando middleware real, validação integrada e API mais expressiva:

```typescript
// app/api/[[...route]]/route.ts
import { Hono } from 'hono';
import { handle } from 'hono/vercel';

const app = new Hono().basePath('/api');
app.get('/users', async (c) => {
  const users = await userService.findAll();
  return c.json(users);
});
export const GET = handle(app);
export const POST = handle(app);
```

---

## 4. Monorepo com Turborepo e pnpm workspaces

O stack **pnpm + Turborepo** domina o ecossistema Next.js em 2025. O template **next-forge** da Vercel (6.9k stars no GitHub) é a referência canônica para SaaS.

### Estrutura consolidada

```
my-saas/
├── apps/
│   ├── web/                  # App principal (Next.js, porta 3000)
│   ├── admin/                # Painel admin (Next.js)
│   ├── docs/                 # Documentação (Fumadocs/Nextra)
│   └── storybook/            # Preview do design system
├── packages/
│   ├── ui/                   # Design system (@repo/ui)
│   ├── types/                # Tipos compartilhados (@repo/types)
│   ├── utils/                # Utilitários (@repo/utils)
│   ├── database/             # Prisma/Drizzle schemas + client
│   ├── auth/                 # Lógica de auth compartilhada
│   ├── domain/               # Entidades, value objects, interfaces
│   ├── application/          # Use cases
│   ├── infrastructure/       # Adapters (repositórios, serviços externos)
│   ├── config-eslint/        # ESLint config compartilhada
│   ├── config-typescript/    # TSConfig presets
│   └── config-tailwind/      # Tailwind config compartilhada
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.json
```

### Configurações essenciais

**pnpm-workspace.yaml:**
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**turbo.json:**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": { "cache": false, "persistent": true },
    "lint": { "dependsOn": ["^lint"] },
    "test": { "outputs": ["coverage/**"], "dependsOn": ["build"] },
    "check-types": { "dependsOn": ["^check-types"] }
  },
  "globalDependencies": [".env"],
  "globalEnv": ["NODE_ENV", "DATABASE_URL"]
}
```

### Path aliases e imports entre packages

A abordagem moderna (2025) para packages internos privados é **apontar exports diretamente para .ts source** — sem etapa de build durante desenvolvimento:

```json
// packages/ui/package.json
{
  "name": "@repo/ui",
  "private": true,
  "exports": {
    ".": "./src/index.ts",
    "./button": "./src/components/button.tsx"
  }
}
```

No app consumidor:
```json
// apps/web/package.json
{
  "dependencies": {
    "@repo/ui": "workspace:*",
    "@repo/types": "workspace:*"
  }
}
```

E em `next.config.js`:
```js
module.exports = {
  transpilePackages: ["@repo/ui", "@repo/utils", "@repo/types"]
}
```

Para **live types** mais robusto, Colin McDonnell (criador do Zod) recomenda **custom export conditions**: o campo `"source"` nos exports aponta para `.ts`, e `tsconfig.json` usa `"customConditions": ["source"]` para resolver TypeScript diretamente para fontes durante desenvolvimento.

### Turborepo vs Nx

**Turborepo** vence para Next.js SaaS: setup em ~15 minutos, ~20 linhas de config, integração nativa com Vercel, cache remoto gratuito. **Nx** justifica-se para monorepos com 50+ packages, múltiplas linguagens ou necessidade de enforced module boundaries e code generators. O Nx tem ferramentas mais sofisticadas (visualização de dependency graph, conformance rules, extensões IDE), mas a complexidade de configuração (~200+ linhas) raramente compensa para times pequenos/médios.

---

## 5. Convenções de nomenclatura e organização de testes

### Naming conventions consolidadas

| Elemento | Convenção | Exemplo |
|---|---|---|
| Pastas (layers, slices) | `kebab-case` | `add-to-cart/`, `user-profile/` |
| Componentes React (.tsx) | `PascalCase` | `InvoiceCard.tsx`, `LoginForm.tsx` |
| Hooks | `useCamelCase` | `useAuth.ts`, `useCreateInvoice.ts` |
| Utilitários | `camelCase` | `formatCurrency.ts`, `validateEmail.ts` |
| Schemas/stores | `kebab-case` | `invoice.schema.ts`, `auth.store.ts` |
| Constantes | `SCREAMING_SNAKE_CASE` | `API_BASE_URL`, `MAX_RETRY_COUNT` |
| Testes | `*.test.tsx` ou `*.spec.tsx` | `Button.test.tsx` |
| Barrel exports | `index.ts` | Obrigatório em cada slice |

O path de import no FSD segue a gramática **Layer–Slice–Segment**: `@/features/auth/ui` → camada features, slice auth, segmento ui. Isso torna a intenção arquitetural visível em cada import.

### Public API: o papel do index.ts

Cada slice **deve** ter um `index.ts` que exporta apenas o necessário. Consumers importam do slice, nunca de arquivos internos:

```typescript
// ✅ Correto
import { InvoiceCard } from '@/entities/invoice';

// ❌ Errado — viola encapsulamento
import { InvoiceCard } from '@/entities/invoice/ui/InvoiceCard';
```

O `index.ts` usa **named exports explícitos** (nunca `export *`):

```typescript
// entities/invoice/index.ts
export { InvoiceCard } from './ui/InvoiceCard';
export { InvoiceRow } from './ui/InvoiceRow';
export type { Invoice, InvoiceStatus } from './model/types';
```

### Testes co-localizados: o padrão dominante

O padrão **test colocation** (Kent C. Dodds) é o consenso absoluto em 2024-2025: arquivo de teste ao lado do arquivo testado.

```
features/create-invoice/
├── ui/
│   ├── CreateInvoiceForm.tsx
│   └── CreateInvoiceForm.test.tsx    # Co-located
├── model/
│   ├── invoice.schema.ts
│   └── invoice.schema.test.ts        # Co-located
├── api/
│   ├── createInvoice.action.ts
│   └── createInvoice.action.test.ts  # Co-located
└── index.ts
```

**Estratégia por nível**: atoms recebem testes unitários focados (cobertura próxima de 100%), molecules e organisms recebem testes de integração, features/widgets recebem testes comportamentais, e pages recebem testes E2E. Testes de integração e E2E ficam em diretório separado na raiz (`/e2e`, `/tests/integration`).

### Enforcement com ferramentas

- **Steiger**: linter oficial do FSD — valida hierarquia de camadas e imports
- **eslint-plugin-boundaries**: configurável para regras FSD customizadas
- **eslint-plugin-import**: garante barrel exports e previne deep imports

---

## 6. Trade-offs e alternativas comparadas

### FSD vs. estrutura tradicional por tipo

| Critério | Tradicional (`components/`, `pages/`, `hooks/`) | FSD |
|---|---|---|
| **Curva de aprendizado** | Zero — qualquer dev React navega | Alta — exige mudança de mindset |
| **Escalabilidade** | Degrada com 100+ componentes | Projetado para apps enterprise |
| **Encapsulamento** | Nenhum — imports livres entre pastas | Forte — public API por slice, lint enforcement |
| **Discoverability** | Feature espalhada por 5+ pastas | Feature contida em um slice |
| **Overhead** | Mínimo para MVP/protótipos | Significativo para projetos pequenos |
| **Integração Next.js** | Natural — App Router alinha perfeitamente | Fricção — exige re-exports ou adaptação |
| **Onboarding** | 1 dia | 1-2 semanas |

**Recomendação**: tradicional para MVPs e times < 5 devs. FSD quando o projeto alcança **~20+ features distintas** ou precisa de paralelismo entre times. A abordagem híbrida (usar `features/` e `entities/` inspirados no FSD sem a rigidez total das 6 camadas) é o sweet spot para muitos projetos B2B SaaS em crescimento.

### API Routes vs. tRPC vs. backend separado

| Critério | API Routes (Next.js) | tRPC | Backend separado (NestJS/Fastify) |
|---|---|---|---|
| **Type safety** | Manual (Zod + types) | **Automático end-to-end** | Manual ou via codegen |
| **API pública** | ✅ REST nativo | ❌ Não serve 3rd-party | ✅ Full control |
| **Simplicidade** | Alta — co-located | Média — setup inicial | Baixa — infra separada |
| **Performance** | Compartilha compute com SSR | Idem API Routes | **5-7x mais throughput** (Fastify) |
| **WebSockets** | ❌ Não suportado nativamente | Subscriptions (limitado) | ✅ Full support |
| **Middleware** | Limitado (Edge only) | Built-in (via adapters) | ✅ Full pipeline |
| **Deploy** | Git push → Vercel | Idem API Routes | Docker, PM2, health checks |
| **Melhor para** | 90% dos SaaS CRUD | Dashboard interno, monorepo TS | Multi-tenant, real-time, microservices |

**Para SaaS B2B típico**: comece com **API Routes + Server Actions** para mutações internas e rotas REST para APIs consumidas externamente. Se o frontend é o único consumer e type safety é prioridade, **tRPC** é excelente — mas não serve APIs públicas. Se há necessidade de WebSockets, filas, ou processamento pesado, **extraia um backend separado** no monorepo (`apps/api/` com NestJS ou Fastify) compartilhando packages de domínio.

O **padrão BFF (Backend-for-Frontend)** é um meio-termo poderoso: API Routes do Next.js atuam como agregador/orquestrador que chama microservices backend, mantendo a simplicidade do deploy Vercel com a flexibilidade de backends especializados.

---

## Conclusão: a arquitetura que escala

A combinação que emerge como mais robusta para SaaS B2B em 2025 não é dogmática sobre nenhum padrão isolado — é **pragmaticamente híbrida**. O monorepo Turborepo/pnpm fornece a fundação. Dentro de cada app, o FSD organiza features e entidades com boundaries explícitos, enquanto Atomic Design vive exclusivamente na camada `shared/ui` como taxonomia do design system. No backend, API Routes com Clean Architecture (domain → application → infrastructure) mantêm lógica de negócio testável e desacoplada do framework.

Três insights não óbvios desta pesquisa: primeiro, o FSD v2.1 recomenda **começar pelas pages e extrair para camadas inferiores apenas quando há reuso** — o oposto do instinto de "arquitetar tudo antes". Segundo, a abordagem de **custom export conditions** no `package.json` (com campo `"source"`) resolve elegantemente o problema de live types em monorepo sem build steps. Terceiro, usar **Hono dentro de um catch-all route handler** do Next.js é um padrão emergente que recupera middleware real e ergonomia de API framework sem sair do deploy serverless. O ponto de partida mais produtivo é clonar o **next-forge** da Vercel e adaptar progressivamente a estrutura FSD conforme a complexidade cresce.