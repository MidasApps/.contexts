# Liquid DataViz Foundation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize the Next.js project with FSD architecture, Tailwind CSS v4 design tokens, shared UI components, core layout shell (sidebar + content + AI sidebar), and entity types from BigQuery schemas.

**Architecture:** Next.js 15 App Router with FSD layer structure under `src/`. The `app/` directory is a thin routing layer that re-exports from FSD `src/pages/`. Tailwind CSS v4 with CSS-first `@theme` config. Dark mode only. All design tokens defined as CSS custom properties. shadcn/ui components customized to match Liquid brand.

**Tech Stack:** Next.js 15, React 19, TypeScript 5, Tailwind CSS v4 (`@tailwindcss/postcss`), shadcn/ui, Lucide React, Inter + Manrope + JetBrains Mono fonts, pnpm.

---

## File Structure

```
liquid-play-dataviz/
├── app/                              # Next.js App Router (thin routing layer)
│   ├── layout.tsx                    # Root layout -> re-exports from src/app
│   ├── page.tsx                      # Root page -> redirect to /dashboard
│   ├── dashboard/
│   │   └── page.tsx                  # Re-exports DashboardPage from src/pages
│   ├── contratos/
│   │   └── page.tsx
│   ├── pagamentos/
│   │   └── page.tsx
│   ├── fluxo-de-caixa/
│   │   └── page.tsx
│   ├── pdd/
│   │   └── page.tsx
│   ├── pricing/
│   │   └── page.tsx
│   ├── simulacao/
│   │   └── page.tsx
│   ├── elegibilidade/
│   │   └── page.tsx
│   ├── repasse/
│   │   └── page.tsx
│   ├── detalhamento/
│   │   └── page.tsx
│   ├── anexos/
│   │   ├── rating/
│   │   │   └── page.tsx
│   │   ├── pdd/
│   │   │   └── page.tsx
│   │   └── elegibilidade/
│   │       └── page.tsx
│   ├── api/
│   │   └── chat/
│   │       └── route.ts
│   └── globals.css                   # Tailwind v4 + @theme tokens
├── pages/                            # EMPTY - prevents Pages Router conflict
│   └── README.md
├── src/
│   ├── app/                          # FSD: app layer
│   │   ├── providers/
│   │   │   └── Providers.tsx         # Theme, QueryClient, etc.
│   │   └── layouts/
│   │       └── RootLayout.tsx        # Fonts, global structure
│   ├── pages/                        # FSD: pages layer
│   │   ├── dashboard/
│   │   │   ├── ui/
│   │   │   │   └── DashboardPage.tsx
│   │   │   └── index.ts
│   │   └── ... (one per route)
│   ├── widgets/                      # FSD: widgets layer
│   │   ├── nav-sidebar/
│   │   │   ├── ui/
│   │   │   │   ├── NavSidebar.tsx
│   │   │   │   └── NavItem.tsx
│   │   │   ├── config/
│   │   │   │   └── navigation.ts
│   │   │   └── index.ts
│   │   ├── app-bar/
│   │   │   ├── ui/
│   │   │   │   └── AppBar.tsx
│   │   │   └── index.ts
│   │   ├── global-filters/
│   │   │   ├── ui/
│   │   │   │   └── GlobalFilters.tsx
│   │   │   └── index.ts
│   │   ├── ai-sidebar/
│   │   │   ├── ui/
│   │   │   │   └── AISidebar.tsx
│   │   │   └── index.ts
│   │   ├── kpi-grid/
│   │   │   ├── ui/
│   │   │   │   └── KpiGrid.tsx
│   │   │   └── index.ts
│   │   ├── data-table-widget/
│   │   │   ├── ui/
│   │   │   │   └── DataTableWidget.tsx
│   │   │   └── index.ts
│   │   └── chart-widget/
│   │       ├── ui/
│   │       │   └── ChartWidget.tsx
│   │       └── index.ts
│   ├── features/                     # FSD: features layer
│   │   └── ... (later plans)
│   ├── entities/                     # FSD: entities layer
│   │   ├── contrato/
│   │   │   ├── model/
│   │   │   │   └── types.ts
│   │   │   └── index.ts
│   │   ├── pagamento/
│   │   │   ├── model/
│   │   │   │   └── types.ts
│   │   │   └── index.ts
│   │   └── fluxo-caixa/
│   │       ├── model/
│   │       │   └── types.ts
│   │       └── index.ts
│   └── shared/                       # FSD: shared layer
│       ├── ui/
│       │   ├── button.tsx
│       │   ├── card.tsx
│       │   ├── badge.tsx
│       │   ├── input.tsx
│       │   ├── select.tsx
│       │   ├── table.tsx
│       │   ├── tabs.tsx
│       │   ├── tooltip.tsx
│       │   ├── dialog.tsx
│       │   ├── dropdown-menu.tsx
│       │   ├── separator.tsx
│       │   ├── skeleton.tsx
│       │   ├── scroll-area.tsx
│       │   ├── sheet.tsx
│       │   ├── command.tsx
│       │   └── sonner.tsx
│       ├── lib/
│       │   ├── utils.ts              # cn() utility
│       │   └── format.ts             # Currency, percentage, date formatters
│       └── config/
│           └── constants.ts          # App-wide constants
├── public/
│   └── fonts/                        # Self-hosted fonts
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── components.json                   # shadcn config
└── .env.local.example
```

---

## Chunk 1: Project Initialization and Configuration

### Task 1: Initialize Next.js project with pnpm

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `.env.local.example`
- Create: `.gitignore`
- Create: `pages/README.md`

- [ ] **Step 1: Create the Next.js project**

Run from the project root (`/Users/giullianosoares/Documents/GCP/liquid-play-dataviz`):

```bash
pnpm init
```

- [ ] **Step 2: Install core dependencies**

```bash
pnpm add next@latest react@latest react-dom@latest
pnpm add -D typescript @types/react @types/react-dom @types/node
pnpm add -D tailwindcss@latest @tailwindcss/postcss@latest
```

- [ ] **Step 3: Create package.json scripts**

Update `package.json` to include:

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
}
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"],
      "@app/*": ["./app/*"]
    },
    "baseUrl": "."
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Create next.config.ts**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
```

- [ ] **Step 6: Create postcss.config.mjs**

```javascript
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
```

- [ ] **Step 7: Create pages/README.md (prevents Pages Router conflict)**

```markdown
# Empty Directory

This directory must remain empty to prevent Next.js from using the Pages Router.
All page components live in `src/pages/` (FSD layer).
```

- [ ] **Step 8: Create .env.local.example**

```env
# Google Cloud / Vertex AI
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1

# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=

# Firecrawl
FIRECRAWL_API_KEY=

# BigQuery
BIGQUERY_DATASET=your_dataset
```

- [ ] **Step 9: Create .gitignore**

```
node_modules/
.next/
.env.local
.env*.local
*.tsbuildinfo
next-env.d.ts
```

- [ ] **Step 10: Verify project initializes**

```bash
npx next build --no-lint 2>&1 | head -20
```

Expected: Build starts (may fail due to missing pages - that's fine at this stage).

- [ ] **Step 11: Commit**

```bash
git init
git add package.json pnpm-lock.yaml tsconfig.json next.config.ts postcss.config.mjs .gitignore .env.local.example pages/README.md
git commit -m "chore: initialize Next.js 15 project with Tailwind CSS v4"
```

---

### Task 2: Configure Tailwind CSS v4 with design tokens

**Files:**
- Create: `app/globals.css`
- Create: `app/layout.tsx` (minimal, to load CSS)

- [ ] **Step 1: Create globals.css with Tailwind v4 @theme tokens**

Create `app/globals.css`:

```css
@import "tailwindcss";

/* ============================================
   Liquid DataViz - Design Tokens
   Dark mode only. No light mode.
   ============================================ */

@theme {
  /* --- Fonts --- */
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-display: 'Manrope', 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* --- Colors --- */
  --color-background: oklch(0% 0 0);
  --color-foreground: oklch(100% 0 0);
  --color-muted: oklch(13% 0 0);
  --color-muted-foreground: oklch(62% 0 0);

  --color-primary: oklch(75.5% 0.14 50);
  --color-primary-foreground: oklch(0% 0 0);
  --color-secondary: oklch(42% 0.03 150);
  --color-secondary-foreground: oklch(100% 0 0);

  --color-accent: oklch(75.5% 0.14 50 / 0.15);
  --color-accent-foreground: oklch(75.5% 0.14 50);

  --color-destructive: oklch(55% 0.22 25);
  --color-destructive-foreground: oklch(100% 0 0);
  --color-success: oklch(60% 0.15 155);
  --color-success-foreground: oklch(100% 0 0);
  --color-warning: oklch(75.5% 0.14 50);
  --color-warning-foreground: oklch(0% 0 0);

  --color-card: oklch(8% 0 0);
  --color-card-foreground: oklch(100% 0 0);
  --color-popover: oklch(10% 0 0);
  --color-popover-foreground: oklch(100% 0 0);

  --color-border: oklch(18% 0 0);
  --color-input: oklch(22% 0 0);
  --color-ring: oklch(75.5% 0.14 50);

  /* --- Chart Colors --- */
  --color-chart-1: oklch(75.5% 0.14 50);
  --color-chart-2: oklch(42% 0.03 150);
  --color-chart-3: oklch(82% 0.10 50);
  --color-chart-4: oklch(52% 0.05 150);
  --color-chart-5: oklch(60% 0.10 50);
  --color-chart-6: oklch(45% 0 0);
  --color-chart-7: oklch(62% 0 0);
  --color-chart-8: oklch(52% 0.06 50);

  /* --- Spacing (base unit: 0.25rem = 4px) --- */
  --spacing: 0.25rem;

  /* --- Radius --- */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;

  /* --- Shadows (subtle for dark mode) --- */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5);

  /* --- Animations --- */
  --animate-accordion-down: accordion-down 0.2s ease-out;
  --animate-accordion-up: accordion-up 0.2s ease-out;

  /* --- Easing --- */
  --ease-default: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-in: cubic-bezier(0.5, 0, 1, 1);
  --ease-out: cubic-bezier(0, 0, 0.17, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.17, 1);
}

@keyframes accordion-down {
  from { height: 0; }
  to { height: var(--radix-accordion-content-height); }
}

@keyframes accordion-up {
  from { height: var(--radix-accordion-content-height); }
  to { height: 0; }
}

/* --- Base Styles --- */
@layer base {
  * {
    border-color: var(--color-border);
  }

  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
}
```

- [ ] **Step 2: Create minimal app/layout.tsx to test**

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Liquid DataViz',
  description: 'Dashboard de dados conectado ao BigQuery',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create minimal app/page.tsx to verify tokens**

```tsx
export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="space-y-4 text-center">
        <h1 className="text-4xl font-bold tracking-tighter text-foreground">
          Liquid DataViz
        </h1>
        <p className="text-muted-foreground">Design tokens loaded.</p>
        <div className="flex gap-3 justify-center">
          <div className="h-10 w-10 rounded-lg bg-primary" />
          <div className="h-10 w-10 rounded-lg bg-secondary" />
          <div className="h-10 w-10 rounded-lg bg-destructive" />
          <div className="h-10 w-10 rounded-lg bg-success" />
          <div className="h-10 w-10 rounded-lg bg-card border" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run dev server and verify**

```bash
pnpm dev
```

Expected: Page renders with black background, white text, orange/olive/red/green color swatches visible.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/layout.tsx app/page.tsx
git commit -m "feat: configure Tailwind CSS v4 with Liquid design tokens"
```

---

### Task 3: Install and configure shadcn/ui

**Files:**
- Create: `components.json`
- Create: `src/shared/lib/utils.ts`

- [ ] **Step 1: Install shadcn dependencies**

```bash
pnpm add class-variance-authority clsx tailwind-merge
pnpm add @radix-ui/react-slot
```

- [ ] **Step 2: Create src/shared/lib/utils.ts**

```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Create components.json**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/shared/ui",
    "utils": "@/shared/lib/utils",
    "ui": "@/shared/ui",
    "lib": "@/shared/lib",
    "hooks": "@/shared/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 4: Install shadcn components in batch**

```bash
pnpm dlx shadcn@latest add button card badge input select table tabs tooltip dialog dropdown-menu separator skeleton scroll-area sheet command sonner accordion popover --yes --overwrite
```

Note: shadcn will place files into `src/shared/ui/` based on `components.json` aliases.

- [ ] **Step 5: Verify components installed**

```bash
ls src/shared/ui/
```

Expected: All component files present (button.tsx, card.tsx, etc.).

- [ ] **Step 6: Commit**

```bash
git add components.json src/shared/ pnpm-lock.yaml package.json
git commit -m "feat: install and configure shadcn/ui components in shared/ui"
```

---

### Task 4: Set up FSD directory structure and entity types

**Files:**
- Create: `src/entities/contrato/model/types.ts`
- Create: `src/entities/contrato/index.ts`
- Create: `src/entities/pagamento/model/types.ts`
- Create: `src/entities/pagamento/index.ts`
- Create: `src/entities/fluxo-caixa/model/types.ts`
- Create: `src/entities/fluxo-caixa/index.ts`
- Create: `src/shared/lib/format.ts`
- Create: `src/shared/config/constants.ts`

- [ ] **Step 1: Create FSD directory skeleton**

```bash
mkdir -p src/{app/{providers,layouts},pages,widgets,features,entities,shared/{ui,lib,config,hooks}}
mkdir -p src/entities/{contrato,pagamento,fluxo-caixa}/{model,ui}
mkdir -p src/widgets/{nav-sidebar,app-bar,global-filters,ai-sidebar,kpi-grid,data-table-widget,chart-widget}/{ui,config}
```

- [ ] **Step 2: Create contrato entity types**

Create `src/entities/contrato/model/types.ts`:

```typescript
export interface Contrato {
  id_contrato: string;
  data_base_report: string; // DATE
  projeto: string;
  empresa?: string;

  // Rating & Score
  score: number;
  faixa_score: string;
  rating_liquid: string;
  faixa_mcmv: string;

  // Financial
  taxa_contrato: number;
  saldo_nominal?: number;
  saldo_devedor?: number;
  valor_imovel?: number;
  valor_atraso?: number;
  valor_pago?: number;
  valor_over_90: number;
  vpl?: number;
  pricing?: number;
  desagio?: number;
  ltv?: number;
  renda_familiar?: number;
  duration?: number;
  correcao_monetaria?: number;

  // Terms
  plano: number;
  prazo_decorrido: number;
  prazo_remanescente: number;
  faixa_remanescente: string;

  // Delinquency
  dias_atraso?: number;
  faixa_atraso_1: string;
  faixa_atraso_2: string;
  categoria_inadimplencia: string;
  perfil_cobranca: string;

  // PDD
  pdd_minimo_bacen: number;
  pdd_liquid: number;
  delta_pdd: number;

  // Restrictions
  restricoes: number;
  tipo_restricao: string;
  faixa_restricao: string;
  valor_pefin: number;
  valor_refin: number;
  valor_protesto: number;
  quantidade_pefin: number;
  quantidade_refin: number;
  quantidade_protesto: number;

  // LTV & Simulation
  faixa_ltv: string;
  ltv_banco: number;
  ltv_banco_stress: number;
  faixa_ltv_banco: string;
  faixa_ltv_stress: string;
  limite_simulacao: number;
  prosoluto_simulacao: number;
  prosoluto_cnpj: number;
  prosoluto_sem_informacao: number;
  prosoluto_total: number;

  // Client
  unidade: number;
  proponent_type: string;
  nome_cliente: string;
  documento: number;
  renda_suficiente: number;
  delta_renda_baixo: number;
  delta_renda_medio: number;
  delta_renda_alto: number;

  // Dates
  data_emissao?: string;
  inicio_monitor: string;
  primeira_parcela: string;
  ultima_parcela: string;
  date_serasa: string;

  // Misc
  prob: number;
  private_area: number;
  Elegibilidade: string;
  grupos_repasse: string;
  taxa_pricing: string;
  Status_contrato: string;
  Categoria_venda: string;
}

export type RatingLiquid = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export type FaixaAtraso =
  | 'Adimplente'
  | '1 a 30'
  | '31 a 60'
  | '61 a 90'
  | '91 a 120'
  | '121 a 150'
  | '151 a 180'
  | '> 180';

export interface ContratoAggregated {
  grupo: string;
  total_contratos: number;
  contratos_com_atraso: number;
  valor_atraso: number;
  saldo_devedor: number;
  saldo_nominal: number;
  inadimplencia_pct: number;
  valor_over_90: number;
  contratos_com_restricao: number;
  valor_imovel: number;
  ltv: number;
  pricing: number;
  media_prazo_remanescente: number;
}
```

- [ ] **Step 3: Create contrato barrel export**

Create `src/entities/contrato/index.ts`:

```typescript
export type {
  Contrato,
  RatingLiquid,
  FaixaAtraso,
  ContratoAggregated,
} from './model/types';
```

- [ ] **Step 4: Create pagamento entity types**

Create `src/entities/pagamento/model/types.ts`:

```typescript
export interface Pagamento {
  data_base_report: string;
  projeto: string;
  id_contrato: string;
  valor_pago: number;
  tipo_recebimento: string;
}

export type TipoRecebimento =
  | 'Pagamento antecipado'
  | 'Recuperação anterior'
  | 'Recuperação mês anterior'
  | 'Vencimento na referência';

export interface PagamentoEvolucao {
  data_base_report: string;
  pagamento_antecipado: number;
  pagamento_antecipado_pct: number;
  vencimento_referencia: number;
  vencimento_referencia_pct: number;
  recuperacao_mes_anterior: number;
  recuperacao_mes_anterior_pct: number;
  recuperacao_anterior: number;
  recuperacao_anterior_pct: number;
  valor_pago: number;
}
```

- [ ] **Step 5: Create pagamento barrel export**

Create `src/entities/pagamento/index.ts`:

```typescript
export type {
  Pagamento,
  TipoRecebimento,
  PagamentoEvolucao,
} from './model/types';
```

- [ ] **Step 6: Create fluxo-caixa entity types**

Create `src/entities/fluxo-caixa/model/types.ts`:

```typescript
export interface FluxoCaixa {
  projeto: string;
  data_base_report: string;
  id_contrato: string;
  empresa: string;
  data_base_fluxo: string;
  fluxo_contratado: number;
  fluxo_esperado: number;
  tipo_recebivel: string;
}

export interface FluxoCaixaAggregated {
  data_base_fluxo: string;
  fluxo_esperado: number;
  fluxo_contratado: number;
}
```

- [ ] **Step 7: Create fluxo-caixa barrel export**

Create `src/entities/fluxo-caixa/index.ts`:

```typescript
export type {
  FluxoCaixa,
  FluxoCaixaAggregated,
} from './model/types';
```

- [ ] **Step 8: Create format utilities**

Create `src/shared/lib/format.ts`:

```typescript
const ptBR = 'pt-BR';

export function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString(ptBR, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    })} mi`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toLocaleString(ptBR, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    })} mil`;
  }
  return value.toLocaleString(ptBR, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPercent(value: number, decimals = 2): string {
  return `${value.toLocaleString(ptBR, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString(ptBR, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString(ptBR, {
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateFull(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString(ptBR, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
```

- [ ] **Step 9: Create shared constants**

Create `src/shared/config/constants.ts`:

```typescript
export const SIDEBAR_WIDTH = 240;
export const AI_SIDEBAR_WIDTH = 360;
export const TABLE_ROW_HEIGHT = 44;
export const CARD_PADDING = 16;
export const DEFAULT_GAP = 12;

export const RATING_COLORS: Record<string, string> = {
  A: 'var(--color-chart-1)',
  B: 'var(--color-chart-2)',
  C: 'var(--color-chart-3)',
  D: 'var(--color-chart-4)',
  E: 'var(--color-chart-5)',
  F: 'var(--color-chart-6)',
  G: 'var(--color-chart-7)',
  H: 'var(--color-chart-8)',
};

export const NAV_ITEMS = [
  { label: 'Visao Geral', href: '/dashboard', icon: 'LayoutDashboard' },
  { label: 'Contratos', href: '/contratos', icon: 'FileText' },
  { label: 'Pagamentos', href: '/pagamentos', icon: 'Banknote' },
  { label: 'Fluxo de Caixa', href: '/fluxo-de-caixa', icon: 'TrendingUp' },
  { label: 'PDD', href: '/pdd', icon: 'ShieldAlert' },
  { label: 'Pricing', href: '/pricing', icon: 'DollarSign' },
  { label: 'Simulacao', href: '/simulacao', icon: 'Calculator' },
  { label: 'Elegibilidade', href: '/elegibilidade', icon: 'CheckCircle' },
  { label: 'Repasse', href: '/repasse', icon: 'ArrowRightLeft' },
  { label: 'Detalhamento', href: '/detalhamento', icon: 'Table' },
] as const;

export const ANEXO_ITEMS = [
  { label: 'Rating Liquid', href: '/anexos/rating' },
  { label: 'PDD', href: '/anexos/pdd' },
  { label: 'Elegibilidade', href: '/anexos/elegibilidade' },
] as const;
```

- [ ] **Step 10: Commit**

```bash
git add src/entities/ src/shared/lib/format.ts src/shared/config/constants.ts
git commit -m "feat: add FSD entity types and shared utilities"
```

---

## Chunk 2: Core Layout Shell

### Task 5: Build the NavSidebar widget

**Files:**
- Create: `src/widgets/nav-sidebar/ui/NavSidebar.tsx`
- Create: `src/widgets/nav-sidebar/ui/NavItem.tsx`
- Create: `src/widgets/nav-sidebar/index.ts`

- [ ] **Step 1: Create NavItem component**

Create `src/widgets/nav-sidebar/ui/NavItem.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/lib/utils';
import {
  LayoutDashboard,
  FileText,
  Banknote,
  TrendingUp,
  ShieldAlert,
  DollarSign,
  Calculator,
  CheckCircle,
  ArrowRightLeft,
  Table,
  type LucideIcon,
} from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  FileText,
  Banknote,
  TrendingUp,
  ShieldAlert,
  DollarSign,
  Calculator,
  CheckCircle,
  ArrowRightLeft,
  Table,
};

interface NavItemProps {
  label: string;
  href: string;
  icon: string;
  collapsed?: boolean;
}

export function NavItem({ label, href, icon, collapsed }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + '/');
  const Icon = iconMap[icon] ?? LayoutDashboard;

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150',
        'hover:bg-accent hover:text-accent-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        isActive
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground',
        collapsed && 'justify-center px-2'
      )}
      title={collapsed ? label : undefined}
      aria-label={label}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.5} />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
```

- [ ] **Step 2: Create NavSidebar component**

Create `src/widgets/nav-sidebar/ui/NavSidebar.tsx`:

```tsx
'use client';

import { cn } from '@/shared/lib/utils';
import { NAV_ITEMS, ANEXO_ITEMS } from '@/shared/config/constants';
import { NavItem } from './NavItem';
import { Separator } from '@/shared/ui/separator';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

interface NavSidebarProps {
  collapsed?: boolean;
  className?: string;
}

export function NavSidebar({ collapsed = false, className }: NavSidebarProps) {
  const [anexosOpen, setAnexosOpen] = useState(false);

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-border bg-background',
        'transition-[width] duration-300 ease-out',
        collapsed ? 'w-16' : 'w-60',
        className
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center px-4">
        <span
          className={cn(
            'font-display text-xl font-bold tracking-tighter text-foreground',
            collapsed && 'sr-only'
          )}
        >
          Liquid
        </span>
        {collapsed && (
          <span className="font-display text-xl font-bold text-primary">L</span>
        )}
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3" aria-label="Menu principal">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.href}
            label={item.label}
            href={item.href}
            icon={item.icon}
            collapsed={collapsed}
          />
        ))}

        {!collapsed && (
          <>
            <Separator className="my-2" />
            <button
              onClick={() => setAnexosOpen(!anexosOpen)}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground',
                'hover:bg-accent hover:text-accent-foreground transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
              )}
            >
              <ChevronDown
                className={cn(
                  'h-4 w-4 transition-transform duration-150',
                  anexosOpen && 'rotate-180'
                )}
                strokeWidth={1.5}
              />
              <span>Anexos</span>
            </button>
            {anexosOpen &&
              ANEXO_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-md px-3 py-2 pl-10 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-150"
                >
                  {item.label}
                </Link>
              ))}
          </>
        )}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 3: Create barrel export**

Create `src/widgets/nav-sidebar/index.ts`:

```typescript
export { NavSidebar } from './ui/NavSidebar';
```

- [ ] **Step 4: Commit**

```bash
git add src/widgets/nav-sidebar/
git commit -m "feat: add NavSidebar widget with navigation items"
```

---

### Task 6: Build the AppBar widget

**Files:**
- Create: `src/widgets/app-bar/ui/AppBar.tsx`
- Create: `src/widgets/app-bar/index.ts`

- [ ] **Step 1: Create AppBar component**

Create `src/widgets/app-bar/ui/AppBar.tsx`:

```tsx
'use client';

import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Menu, MessageSquare } from 'lucide-react';

interface AppBarProps {
  title: string;
  onToggleSidebar?: () => void;
  onToggleAI?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export function AppBar({
  title,
  onToggleSidebar,
  onToggleAI,
  className,
  children,
}: AppBarProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/95 px-4 backdrop-blur-sm',
        className
      )}
    >
      {/* Mobile menu toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onToggleSidebar}
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" strokeWidth={1.5} />
      </Button>

      {/* Page title */}
      <h1 className="font-display text-lg font-semibold tracking-tight text-foreground truncate">
        {title}
      </h1>

      {/* Filters slot */}
      <div className="flex flex-1 items-center justify-end gap-3">
        {children}

        {/* AI toggle button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleAI}
          aria-label="Abrir assistente AI"
          className="text-muted-foreground hover:text-primary"
        >
          <MessageSquare className="h-5 w-5" strokeWidth={1.5} />
        </Button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Create barrel export**

Create `src/widgets/app-bar/index.ts`:

```typescript
export { AppBar } from './ui/AppBar';
```

- [ ] **Step 3: Commit**

```bash
git add src/widgets/app-bar/
git commit -m "feat: add AppBar widget with mobile menu and AI toggle"
```

---

### Task 7: Build the GlobalFilters widget

**Files:**
- Create: `src/widgets/global-filters/ui/GlobalFilters.tsx`
- Create: `src/widgets/global-filters/index.ts`

- [ ] **Step 1: Create GlobalFilters component**

Create `src/widgets/global-filters/ui/GlobalFilters.tsx`:

```tsx
'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

interface GlobalFiltersProps {
  dataBaseReport?: string;
  projeto?: string;
  dataBaseOptions?: string[];
  projetoOptions?: string[];
  onDataBaseChange?: (value: string) => void;
  onProjetoChange?: (value: string) => void;
}

export function GlobalFilters({
  dataBaseReport,
  projeto,
  dataBaseOptions = [],
  projetoOptions = [],
  onDataBaseChange,
  onProjetoChange,
}: GlobalFiltersProps) {
  return (
    <div className="flex items-center gap-3">
      <Select value={dataBaseReport} onValueChange={onDataBaseChange}>
        <SelectTrigger className="h-9 w-48 text-sm bg-card border-border">
          <SelectValue placeholder="Data Base Report" />
        </SelectTrigger>
        <SelectContent>
          {dataBaseOptions.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={projeto} onValueChange={onProjetoChange}>
        <SelectTrigger className="h-9 w-48 text-sm bg-card border-border">
          <SelectValue placeholder="Projeto" />
        </SelectTrigger>
        <SelectContent>
          {projetoOptions.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 2: Create barrel export**

Create `src/widgets/global-filters/index.ts`:

```typescript
export { GlobalFilters } from './ui/GlobalFilters';
```

- [ ] **Step 3: Commit**

```bash
git add src/widgets/global-filters/
git commit -m "feat: add GlobalFilters widget with Data Base Report and Projeto selects"
```

---

### Task 8: Build the AI Sidebar placeholder widget

**Files:**
- Create: `src/widgets/ai-sidebar/ui/AISidebar.tsx`
- Create: `src/widgets/ai-sidebar/index.ts`

- [ ] **Step 1: Create AISidebar placeholder**

Create `src/widgets/ai-sidebar/ui/AISidebar.tsx`:

```tsx
'use client';

import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { X, Sparkles } from 'lucide-react';

interface AISidebarProps {
  open: boolean;
  onClose: () => void;
  className?: string;
}

export function AISidebar({ open, onClose, className }: AISidebarProps) {
  return (
    <aside
      className={cn(
        'flex h-full flex-col border-l border-border bg-background',
        'transition-[width,opacity] duration-300 ease-out',
        open ? 'w-[360px] opacity-100' : 'w-0 opacity-0 overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" strokeWidth={1.5} />
          <span className="font-display text-sm font-semibold tracking-tight">
            Assistente AI
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Fechar assistente"
          className="h-8 w-8"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </Button>
      </div>

      {/* Chat area - placeholder for Vercel AI SDK integration */}
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Sparkles className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">
          Pergunte sobre seus indicadores, contratos ou qualquer dado do dashboard.
        </p>
      </div>

      {/* Input area placeholder */}
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2">
          <input
            type="text"
            placeholder="Pergunte algo..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            disabled
          />
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Create barrel export**

Create `src/widgets/ai-sidebar/index.ts`:

```typescript
export { AISidebar } from './ui/AISidebar';
```

- [ ] **Step 3: Commit**

```bash
git add src/widgets/ai-sidebar/
git commit -m "feat: add AISidebar widget placeholder"
```

---

### Task 9: Build the KpiGrid widget

**Files:**
- Create: `src/widgets/kpi-grid/ui/KpiCard.tsx`
- Create: `src/widgets/kpi-grid/ui/KpiGrid.tsx`
- Create: `src/widgets/kpi-grid/index.ts`

- [ ] **Step 1: Create KpiCard component**

Create `src/widgets/kpi-grid/ui/KpiCard.tsx`:

```tsx
import { cn } from '@/shared/lib/utils';
import { Card, CardContent } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';

interface KpiCardProps {
  label: string;
  value: string;
  subtitle?: string;
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'neutral';
  };
  loading?: boolean;
  className?: string;
}

export function KpiCard({
  label,
  value,
  subtitle,
  trend,
  loading,
  className,
}: KpiCardProps) {
  if (loading) {
    return (
      <Card className={cn('bg-card', className)}>
        <CardContent className="p-4">
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-8 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('bg-card', className)}>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground tracking-wide">
          {label}
        </p>
        <p className="mt-1 font-display text-3xl font-bold tracking-tighter text-foreground">
          {value}
        </p>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
        {trend && (
          <p
            className={cn(
              'mt-1 text-xs font-medium',
              trend.direction === 'up' && 'text-success',
              trend.direction === 'down' && 'text-destructive',
              trend.direction === 'neutral' && 'text-muted-foreground'
            )}
          >
            {trend.value}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create KpiGrid component**

Create `src/widgets/kpi-grid/ui/KpiGrid.tsx`:

```tsx
import { cn } from '@/shared/lib/utils';

interface KpiGridProps {
  children: React.ReactNode;
  columns?: 2 | 3 | 4 | 6;
  className?: string;
}

export function KpiGrid({ children, columns = 3, className }: KpiGridProps) {
  return (
    <div
      className={cn(
        'grid gap-3',
        columns === 2 && 'grid-cols-1 sm:grid-cols-2',
        columns === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        columns === 4 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
        columns === 6 && 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
        className
      )}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Create barrel export**

Create `src/widgets/kpi-grid/index.ts`:

```typescript
export { KpiCard } from './ui/KpiCard';
export { KpiGrid } from './ui/KpiGrid';
```

- [ ] **Step 4: Commit**

```bash
git add src/widgets/kpi-grid/
git commit -m "feat: add KpiCard and KpiGrid widgets"
```

---

### Task 10: Build the main DashboardLayout (pages layer)

**Files:**
- Create: `src/app/providers/Providers.tsx`
- Create: `src/app/layouts/DashboardLayout.tsx`
- Modify: `app/layout.tsx` (integrate fonts + providers)
- Create: `app/dashboard/page.tsx`
- Create: `src/pages/dashboard/ui/DashboardPage.tsx`
- Create: `src/pages/dashboard/index.ts`

- [ ] **Step 1: Create Providers wrapper**

Create `src/app/providers/Providers.tsx`:

```tsx
'use client';

import { type ReactNode } from 'react';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return <>{children}</>;
}
```

- [ ] **Step 2: Create DashboardLayout**

Create `src/app/layouts/DashboardLayout.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { NavSidebar } from '@/widgets/nav-sidebar';
import { AISidebar } from '@/widgets/ai-sidebar';
import { Sheet, SheetContent } from '@/shared/ui/sheet';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <NavSidebar />
      </div>

      {/* Mobile sidebar drawer */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-60 p-0">
          <NavSidebar />
        </SheetContent>
      </Sheet>

      {/* Main content area */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {children}
      </main>

      {/* AI Sidebar - desktop */}
      <div className="hidden lg:flex">
        <AISidebar open={aiOpen} onClose={() => setAiOpen(false)} />
      </div>

      {/* AI Sidebar - mobile drawer */}
      <Sheet open={aiOpen && typeof window !== 'undefined' && window.innerWidth < 1024} onOpenChange={setAiOpen}>
        <SheetContent side="right" className="w-full max-w-[360px] p-0">
          <AISidebar open={true} onClose={() => setAiOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
```

- [ ] **Step 3: Update app/layout.tsx with fonts and providers**

Replace `app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Inter, Manrope, JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/app/providers/Providers';
import { DashboardLayout } from '@/app/layouts/DashboardLayout';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Liquid DataViz',
  description: 'Dashboard de dados conectado ao BigQuery',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${manrope.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>
          <DashboardLayout>{children}</DashboardLayout>
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Create DashboardPage (FSD pages layer)**

Create `src/pages/dashboard/ui/DashboardPage.tsx`:

```tsx
import { AppBar } from '@/widgets/app-bar';
import { GlobalFilters } from '@/widgets/global-filters';
import { KpiCard, KpiGrid } from '@/widgets/kpi-grid';
import { ScrollArea } from '@/shared/ui/scroll-area';

export function DashboardPage() {
  return (
    <>
      <AppBar title="Visao Geral">
        <GlobalFilters
          dataBaseOptions={['jan. de 2026', 'dez. de 2025', 'nov. de 2025']}
          projetoOptions={['VIVA PARK', 'Projeto B']}
        />
      </AppBar>

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-4 lg:p-6">
          {/* KPIs */}
          <KpiGrid columns={6}>
            <KpiCard label="Total Contratos" value="278" />
            <KpiCard label="Saldo Devedor" value="419,5 mi" />
            <KpiCard label="Saldo Nominal" value="443,4 mi" />
            <KpiCard
              label="Inadimplencia"
              value="0,49%"
              trend={{ value: '-0.05pp vs anterior', direction: 'down' }}
            />
            <KpiCard label="Valor em Atraso" value="2,17 mi" />
            <KpiCard label="LTV" value="87,34%" />
          </KpiGrid>

          {/* Placeholder for table */}
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              Tabela de indicadores por Faixa de Atraso sera implementada na proxima fase.
            </p>
          </div>
        </div>
      </ScrollArea>
    </>
  );
}
```

- [ ] **Step 5: Create barrel export**

Create `src/pages/dashboard/index.ts`:

```typescript
export { DashboardPage } from './ui/DashboardPage';
```

- [ ] **Step 6: Create app/dashboard/page.tsx (re-export)**

Create `app/dashboard/page.tsx`:

```tsx
export { DashboardPage as default } from '@/pages/dashboard';
```

- [ ] **Step 7: Update app/page.tsx to redirect to dashboard**

Replace `app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/dashboard');
}
```

- [ ] **Step 8: Run dev server and verify layout**

```bash
pnpm dev
```

Expected: Full layout visible - NavSidebar on left (desktop), AppBar at top with Global Filters, KPI cards in a grid, black background with orange primary accents.

- [ ] **Step 9: Commit**

```bash
git add app/ src/app/ src/pages/dashboard/
git commit -m "feat: add DashboardLayout with sidebar, AppBar, KPIs, and routing"
```

---

### Task 11: Create stub pages for all routes

**Files:**
- Create route files for all dashboard screens

- [ ] **Step 1: Create page stubs for all routes**

For each route, create two files: the FSD page component and the Next.js re-export.

Create `src/pages/contratos/ui/ContratosPage.tsx`:
```tsx
import { AppBar } from '@/widgets/app-bar';
import { GlobalFilters } from '@/widgets/global-filters';
import { ScrollArea } from '@/shared/ui/scroll-area';

export function ContratosPage() {
  return (
    <>
      <AppBar title="Contratos">
        <GlobalFilters />
      </AppBar>
      <ScrollArea className="flex-1">
        <div className="p-4 lg:p-6">
          <p className="text-muted-foreground text-sm">Contratos - em desenvolvimento</p>
        </div>
      </ScrollArea>
    </>
  );
}
```

Create `src/pages/contratos/index.ts`:
```typescript
export { ContratosPage } from './ui/ContratosPage';
```

Create `app/contratos/page.tsx`:
```tsx
export { ContratosPage as default } from '@/pages/contratos';
```

Repeat the same pattern for: `pagamentos`, `fluxo-de-caixa`, `pdd`, `pricing`, `simulacao`, `elegibilidade`, `repasse`, `detalhamento`, `anexos/rating`, `anexos/pdd`, `anexos/elegibilidade`.

Each page follows the template:
- FSD: `src/pages/[slug]/ui/[Name]Page.tsx` with AppBar + GlobalFilters + placeholder content
- FSD: `src/pages/[slug]/index.ts` barrel export
- Next.js: `app/[slug]/page.tsx` re-export

- [ ] **Step 2: Verify all routes work**

Navigate to each route in the browser and confirm the layout renders with the correct title.

- [ ] **Step 3: Commit**

```bash
git add app/ src/pages/
git commit -m "feat: add stub pages for all dashboard routes with FSD re-exports"
```

---

## Chunk 3: Data Table and Chart Widgets

### Task 12: Install Recharts and TanStack Table

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install chart and table dependencies**

```bash
pnpm add recharts @tanstack/react-table @tanstack/react-virtual
```

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: install recharts, @tanstack/react-table, @tanstack/react-virtual"
```

---

### Task 13: Build the DataTableWidget

**Files:**
- Create: `src/widgets/data-table-widget/ui/DataTableWidget.tsx`
- Create: `src/widgets/data-table-widget/index.ts`

- [ ] **Step 1: Create DataTableWidget component**

Create `src/widgets/data-table-widget/ui/DataTableWidget.tsx`:

```tsx
'use client';

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { ArrowUpDown } from 'lucide-react';

interface DataTableWidgetProps<TData, TValue> {
  title?: string;
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  loading?: boolean;
  className?: string;
  footerRow?: Record<string, string | number>;
}

export function DataTableWidget<TData, TValue>({
  title,
  columns,
  data,
  loading,
  className,
  footerRow,
}: DataTableWidgetProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <Card className={cn('bg-card', className)}>
      {title && (
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold tracking-tight">
            {title}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className={cn(!title && 'pt-4')}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-border hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="h-10 text-xs font-semibold text-muted-foreground tracking-wide whitespace-nowrap"
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          className={cn(
                            'flex items-center gap-1',
                            header.column.getCanSort() && 'cursor-pointer select-none hover:text-foreground transition-colors duration-150'
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            <ArrowUpDown className="h-3 w-3" strokeWidth={1.5} />
                          )}
                        </button>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {columns.map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
                    Nenhum dado encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="h-11 border-border hover:bg-muted/50 transition-colors duration-150"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="text-sm whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
              {footerRow && (
                <TableRow className="h-11 border-border font-semibold bg-muted/30">
                  {columns.map((col, i) => (
                    <TableCell key={i} className="text-sm whitespace-nowrap">
                      {footerRow[(col as { accessorKey?: string }).accessorKey ?? ''] ?? ''}
                    </TableCell>
                  ))}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create barrel export**

Create `src/widgets/data-table-widget/index.ts`:

```typescript
export { DataTableWidget } from './ui/DataTableWidget';
```

- [ ] **Step 3: Commit**

```bash
git add src/widgets/data-table-widget/
git commit -m "feat: add DataTableWidget with sorting, loading, and empty states"
```

---

### Task 14: Build the ChartWidget wrapper

**Files:**
- Create: `src/widgets/chart-widget/ui/ChartWidget.tsx`
- Create: `src/widgets/chart-widget/index.ts`

- [ ] **Step 1: Create ChartWidget component**

Create `src/widgets/chart-widget/ui/ChartWidget.tsx`:

```tsx
import { cn } from '@/shared/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';

interface ChartWidgetProps {
  title: string;
  subtitle?: string;
  loading?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function ChartWidget({
  title,
  subtitle,
  loading,
  className,
  children,
}: ChartWidgetProps) {
  return (
    <Card className={cn('bg-card', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold tracking-tight">
          {title}
        </CardTitle>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-64 w-full rounded-md" />
          </div>
        ) : (
          <div className="h-64">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create barrel export**

Create `src/widgets/chart-widget/index.ts`:

```typescript
export { ChartWidget } from './ui/ChartWidget';
```

- [ ] **Step 3: Commit**

```bash
git add src/widgets/chart-widget/
git commit -m "feat: add ChartWidget wrapper with loading skeleton"
```

---

### Task 15: Build the DashboardPage with real KPIs, table, and chart structure

**Files:**
- Modify: `src/pages/dashboard/ui/DashboardPage.tsx`

- [ ] **Step 1: Update DashboardPage with sample data table**

Replace `src/pages/dashboard/ui/DashboardPage.tsx` with the full implementation using DataTableWidget and sample data matching Screenshot 1 (Resumo / Visao Geral):

```tsx
'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { AppBar } from '@/widgets/app-bar';
import { GlobalFilters } from '@/widgets/global-filters';
import { KpiCard, KpiGrid } from '@/widgets/kpi-grid';
import { DataTableWidget } from '@/widgets/data-table-widget';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { formatCurrency, formatPercent, formatNumber } from '@/shared/lib/format';

interface FaixaAtrasoRow {
  faixa_atraso: string;
  id_contrato: number;
  pct_contratos: number;
  valor_atraso: number;
  inadimplencia_pct: number;
  saldo_nominal: number;
  saldo_devedor: number;
}

const sampleData: FaixaAtrasoRow[] = [
  { faixa_atraso: 'Adimplente', id_contrato: 190, pct_contratos: 68.35, valor_atraso: 0, inadimplencia_pct: 0, saldo_nominal: 325.4e6, saldo_devedor: 302.1e6 },
  { faixa_atraso: '1 a 30', id_contrato: 28, pct_contratos: 10.07, valor_atraso: 0.12e6, inadimplencia_pct: 0.03, saldo_nominal: 45.2e6, saldo_devedor: 42.1e6 },
  { faixa_atraso: '31 a 60', id_contrato: 15, pct_contratos: 5.40, valor_atraso: 0.28e6, inadimplencia_pct: 0.07, saldo_nominal: 22.8e6, saldo_devedor: 21.3e6 },
  { faixa_atraso: '61 a 90', id_contrato: 12, pct_contratos: 4.32, valor_atraso: 0.35e6, inadimplencia_pct: 0.08, saldo_nominal: 18.5e6, saldo_devedor: 17.2e6 },
  { faixa_atraso: '91 a 120', id_contrato: 10, pct_contratos: 3.60, valor_atraso: 0.42e6, inadimplencia_pct: 0.10, saldo_nominal: 12.3e6, saldo_devedor: 11.5e6 },
  { faixa_atraso: '121 a 150', id_contrato: 8, pct_contratos: 2.88, valor_atraso: 0.38e6, inadimplencia_pct: 0.09, saldo_nominal: 8.9e6, saldo_devedor: 8.3e6 },
  { faixa_atraso: '151 a 180', id_contrato: 7, pct_contratos: 2.52, valor_atraso: 0.32e6, inadimplencia_pct: 0.08, saldo_nominal: 5.7e6, saldo_devedor: 5.3e6 },
  { faixa_atraso: '> 180', id_contrato: 8, pct_contratos: 2.88, valor_atraso: 0.30e6, inadimplencia_pct: 0.07, saldo_nominal: 4.6e6, saldo_devedor: 4.2e6 },
];

const columns: ColumnDef<FaixaAtrasoRow>[] = [
  { accessorKey: 'faixa_atraso', header: 'Faixa Atraso' },
  { accessorKey: 'id_contrato', header: 'ID Contrato', cell: ({ getValue }) => formatNumber(getValue() as number) },
  { accessorKey: 'pct_contratos', header: '% Contratos', cell: ({ getValue }) => formatPercent(getValue() as number) },
  { accessorKey: 'valor_atraso', header: 'Valor Atraso', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'inadimplencia_pct', header: 'Inadimplencia %', cell: ({ getValue }) => formatPercent(getValue() as number) },
  { accessorKey: 'saldo_nominal', header: 'Saldo Nominal', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  { accessorKey: 'saldo_devedor', header: 'Saldo Devedor', cell: ({ getValue }) => formatCurrency(getValue() as number) },
];

export function DashboardPage() {
  return (
    <>
      <AppBar title="Visao Geral">
        <GlobalFilters
          dataBaseOptions={['jan. de 2026', 'dez. de 2025', 'nov. de 2025']}
          projetoOptions={['VIVA PARK', 'Projeto B']}
        />
      </AppBar>

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-4 lg:p-6">
          {/* KPIs matching Screenshot 1 */}
          <KpiGrid columns={6}>
            <KpiCard label="Total Contratos" value="278" />
            <KpiCard label="Saldo Devedor" value="419,47 mi" />
            <KpiCard label="Saldo Nominal" value="443,40 mi" />
            <KpiCard label="Inadimplencia" value="0,49%" />
            <KpiCard label="Valor em Atraso" value="2,17 mi" />
            <KpiCard label="LTV" value="87,34%" />
          </KpiGrid>

          {/* Table by Faixa Atraso - Screenshot 1 */}
          <DataTableWidget
            title="Indicadores por Faixa de Atraso"
            columns={columns}
            data={sampleData}
            footerRow={{
              faixa_atraso: 'Total geral',
              id_contrato: '278',
              pct_contratos: '100,00%',
              valor_atraso: '2,17 mi',
              inadimplencia_pct: '0,49%',
              saldo_nominal: '443,40 mi',
              saldo_devedor: '419,47 mi',
            }}
          />
        </div>
      </ScrollArea>
    </>
  );
}
```

- [ ] **Step 2: Run dev server and verify**

```bash
pnpm dev
```

Expected: Dashboard page shows 6 KPI cards in a row, followed by a sortable data table with Faixa Atraso rows and a total footer row.

- [ ] **Step 3: Commit**

```bash
git add src/pages/dashboard/
git commit -m "feat: implement DashboardPage with KPIs and Faixa Atraso table"
```

---

## Summary

This plan covers the **foundation** of the Liquid DataViz project:

1. **Project initialization** - Next.js 15, Tailwind CSS v4, TypeScript, pnpm
2. **Design tokens** - All Liquid brand colors, typography, spacing as CSS custom properties
3. **shadcn/ui** - Component library configured for FSD shared/ui layer
4. **Entity types** - TypeScript interfaces for all 3 BigQuery tables
5. **Core widgets** - NavSidebar, AppBar, GlobalFilters, AISidebar (placeholder), KpiGrid, DataTableWidget, ChartWidget
6. **Layout shell** - Desktop sidebar + content + AI sidebar, mobile drawer pattern
7. **Route stubs** - All 13 dashboard routes with FSD re-export pattern
8. **DashboardPage** - First complete page with KPIs and data table

**Next plans to create:**
- `2026-03-12-liquid-dataviz-dashboard-pages.md` - All 23 screens with real chart/table implementations
- `2026-03-12-liquid-dataviz-ai-integration.md` - Vercel AI SDK + Gemini + Firecrawl + chat sidebar
- `2026-03-12-liquid-dataviz-auth-api.md` - Firebase Auth + BigQuery API routes + role-based access
