# DoD-1: Destravar Cliente Externo + Segurança Cross-Tenant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer um usuário **não-admin** de um cliente externo (Vila Rosa) usar o produto ponta-a-ponta em `/g` — logar, ter a rota concedida pela Admin UI, abrir reports, ver erros de métrica em vez de blocos vazios — e fechar os buracos de escrita cross-tenant que a auditoria confirmou.

**Architecture:** As correções são cirúrgicas na camada de permissões (uma função pura `normalizeRoute` que reconcilia a granularidade de rota cliente↔servidor + tornar `/g` concedível), nas regras Firestore (fechar write cross-tenant), no guard de escrita de rotas globais (exigir admin), no hardening do modo embedded (validar `origin`), e na propagação de erro de métrica até o bloco. Sem features novas.

**Tech Stack:** Next.js 16 App Router, TypeScript, Firestore (Admin SDK no backend + client SDK no browser), Vitest 4 (happy-dom, BigQuery mockado), Tailwind v4.

## Global Constraints

- Gerenciador de pacotes: **pnpm** (v10.32.1) — nunca npm/yarn.
- Testes: `pnpm vitest run <arquivo>` (nunca `pnpm test` sem filtro — pega smokes lentos/flaky).
- Multi-tenancy é **fail-closed** (ADR-0006); nenhuma correção pode abrir acesso por default.
- ADRs em `adrs/decisions/` são canônicas; em divergência, a ADR vence.
- Estilo: usar tokens semânticos (`bg-card`, `text-foreground`, `border-border`), nunca cor hardcoded.
- **Nunca** commitar `secrets/`, `.env*`, `docker-compose.yml`, `.dockerignore`, `.gitignore` — `git add` só os arquivos da tarefa.
- **Não** rodar seeds/BQ/Vertex reais durante o desenvolvimento; re-seed de produção é decisão do usuário (dry-run + guarda anti-sobrescrita).
- Um commit por task, ao final da task.
- Cada task deriva de um achado do backlog `docs/auditoria/2026-07-21-backlog-remediacao.md`; o `id` está no título da task.

---

## File Structure

- `src/shared/lib/permissions/normalize-route.ts` — **novo.** Função pura `normalizeRoute(pathname)`; colapsa rotas dinâmicas (`/g/...` → `/g`) para o check de permissão bater com o servidor.
- `src/shared/lib/permissions/__tests__/normalize-route.test.ts` — **novo.** Testes da função pura.
- `src/features/admin/model/types.ts` — modificar `ALL_ROUTES` (adicionar `/g`).
- `src/features/admin/ui/RouteCheckboxGrid.tsx` — exportar `ROUTE_GROUPS` e cobrir todos os grupos.
- `src/features/admin/ui/__tests__/route-grantability.test.ts` — **novo.** Invariante: todo grupo de `ALL_ROUTES` é renderizado.
- `src/features/auth/ui/ProtectedRoute.tsx` — usar `normalizeRoute` no `pathToCheck`.
- `firestore.rules` — fechar write cross-tenant em `clients/{id}/groups` e `/reports`.
- `app/api/dashboard-templates/route.ts` — exigir admin em POST/PATCH/DELETE.
- `app/api/dashboard-templates/__tests__/admin-guard.test.ts` — **novo.**
- `src/features/auth/lib/embed-origin.ts` — **novo.** `isAllowedEmbedOrigin(origin)` puro + allowlist por env.
- `src/features/auth/lib/__tests__/embed-origin.test.ts` — **novo.**
- `src/features/auth/providers/AuthProvider.tsx` — validar `event.origin` no handler embedded.
- `src/shared/hooks/useReportData.ts` — propagar erro por-métrica (mapa `errorsByMetric`).
- `src/pages/report/ui/ReportPage.tsx` e `src/pages/dynamic/ui/RouteTemplatePage.tsx` — renderizar `BlockError` quando a métrica falha.
- `scripts/templates/*.template.mjs` (10 arquivos Play) — `productRefs: ['play']` → `['liquid-play']`.
- `src/widgets/nav-sidebar/.../__tests__/TemplateGallery.test.tsx` — estender para o caso productBindings.

---

## Task 1 · [a4-cliente-permissoes-01 + a4-cliente-permissoes-02] `/g` concedível + route-match cliente↔servidor (P0)

**Contexto:** Servidor valida a string `/g` (`execute-metric.ts:150` → `routeForMetric` → `/g` para toda `covenants.*`). Cliente valida o pathname completo `/g/{groupId}/r/{reportId}` (`ProtectedRoute.tsx:25`). As duas strings **nunca** coincidem, e `/g` nem está em `ALL_ROUTES` (não é concedível). Sem esta task, nenhum não-admin abre um report.

**Files:**
- Create: `src/shared/lib/permissions/normalize-route.ts`
- Create: `src/shared/lib/permissions/__tests__/normalize-route.test.ts`
- Modify: `src/features/admin/model/types.ts:55-70` (`ALL_ROUTES`)
- Modify: `src/features/admin/ui/RouteCheckboxGrid.tsx:11` (`ROUTE_GROUPS`)
- Create: `src/features/admin/ui/__tests__/route-grantability.test.ts`
- Modify: `src/features/auth/ui/ProtectedRoute.tsx:25,32`

**Interfaces:**
- Produces: `normalizeRoute(pathname: string): string` — colapsa `/g` e `/g/*` para `/g`; devolve o pathname inalterado para as demais rotas.
- Produces: `ROUTE_GROUPS: readonly string[]` exportado de `RouteCheckboxGrid.tsx`.

- [ ] **Step 1: Escrever o teste que falha (normalizeRoute)**

```ts
// src/shared/lib/permissions/__tests__/normalize-route.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeRoute } from '../normalize-route';

describe('normalizeRoute', () => {
  it('colapsa reports dinâmicos para /g (paridade com routeForMetric)', () => {
    expect(normalizeRoute('/g/covenants/r/visao-executiva')).toBe('/g');
    expect(normalizeRoute('/g')).toBe('/g');
  });
  it('preserva rotas estáticas (match exato com ALL_ROUTES)', () => {
    expect(normalizeRoute('/dashboard')).toBe('/dashboard');
    expect(normalizeRoute('/anexos/rating')).toBe('/anexos/rating');
    expect(normalizeRoute('/explore')).toBe('/explore');
    expect(normalizeRoute('/')).toBe('/');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run src/shared/lib/permissions/__tests__/normalize-route.test.ts`
Expected: FAIL — `Cannot find module '../normalize-route'`.

- [ ] **Step 3: Implementar `normalizeRoute`**

```ts
// src/shared/lib/permissions/normalize-route.ts
/**
 * Reduz um pathname à "rota base" usada no gating de permissão, de modo que a
 * checagem do CLIENTE (ProtectedRoute, por pathname) case com a do SERVIDOR
 * (execute-metric, por routeForMetric). Reports dinâmicos vivem em
 * `/g/{groupId}/r/{reportId}` mas todas as métricas mapeiam para a string `/g`.
 */
export function normalizeRoute(pathname: string): string {
  if (pathname === '/g' || pathname.startsWith('/g/')) return '/g';
  return pathname;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm vitest run src/shared/lib/permissions/__tests__/normalize-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Tornar `/g` concedível — adicionar a `ALL_ROUTES`**

Em `src/features/admin/model/types.ts`, adicionar antes do `] as const;` (linha 70):

```ts
  { path: '/explore', label: 'Análise Conversacional', group: 'IA' },
  { path: '/anexos/rating', label: 'Anexo Rating', group: 'Anexos' },
  { path: '/anexos/pdd', label: 'Anexo PDD', group: 'Anexos' },
  { path: '/anexos/elegibilidade', label: 'Anexo Elegibilidade', group: 'Anexos' },
  { path: '/g', label: 'Reports (Covenants / dinâmicos)', group: 'Reports' },
] as const;
```

(As 4 primeiras linhas já existem — a nova é a de `/g` com `group: 'Reports'`.)

- [ ] **Step 6: Escrever o teste de invariante de grantability (falha)**

```ts
// src/features/admin/ui/__tests__/route-grantability.test.ts
import { describe, it, expect } from 'vitest';
import { ALL_ROUTES } from '@/features/admin/model/types';
import { ROUTE_GROUPS } from '@/features/admin/ui/RouteCheckboxGrid';

describe('RouteCheckboxGrid grantability', () => {
  it('renderiza TODOS os grupos presentes em ALL_ROUTES (nenhuma rota órfã)', () => {
    const grupos = [...new Set(ALL_ROUTES.map((r) => r.group))];
    for (const g of grupos) expect(ROUTE_GROUPS).toContain(g);
  });
  it('/g é concedível', () => {
    expect(ALL_ROUTES.some((r) => r.path === '/g')).toBe(true);
  });
});
```

- [ ] **Step 7: Rodar e confirmar que falha**

Run: `pnpm vitest run src/features/admin/ui/__tests__/route-grantability.test.ts`
Expected: FAIL — `ROUTE_GROUPS` não é exportado e/ou não contém `IA`/`Reports`.

- [ ] **Step 8: Exportar `ROUTE_GROUPS` e cobrir todos os grupos**

Em `src/features/admin/ui/RouteCheckboxGrid.tsx`, trocar a linha 11:

```ts
export const ROUTE_GROUPS = ['Carteira', 'Risco', 'Operacional', 'Anexos', 'IA', 'Reports'] as const;
```

- [ ] **Step 9: Rodar e confirmar que passa**

Run: `pnpm vitest run src/features/admin/ui/__tests__/route-grantability.test.ts`
Expected: PASS.

- [ ] **Step 10: Aplicar `normalizeRoute` no ProtectedRoute (paridade com o servidor)**

Em `src/features/auth/ui/ProtectedRoute.tsx`:
- adicionar o import no topo: `import { normalizeRoute } from '@/shared/lib/permissions/normalize-route';`
- trocar a linha 25 de `const pathToCheck = requiredPath ?? pathname ?? '/';` para:

```ts
  const pathToCheck = normalizeRoute(requiredPath ?? pathname ?? '/');
```

- [ ] **Step 11: Rodar a suíte de permissões e o lint**

Run: `pnpm vitest run src/shared/lib/permissions src/features/admin/ui/__tests__/route-grantability.test.ts`
Expected: PASS.
Run: `pnpm lint`
Expected: sem erros novos.

- [ ] **Step 12: Commit**

```bash
git add src/shared/lib/permissions/normalize-route.ts src/shared/lib/permissions/__tests__/normalize-route.test.ts src/features/admin/model/types.ts src/features/admin/ui/RouteCheckboxGrid.tsx src/features/admin/ui/__tests__/route-grantability.test.ts src/features/auth/ui/ProtectedRoute.tsx
git commit -m "fix(perms): /g concedível na Admin UI + route-match cliente↔servidor (a4-01/a4-02)"
```

**Verificação de aceite (DoD-1):** após conceder `/g` a um usuário não-admin com `clientAccess=[vila-rosa]`, ele carrega `/g/{groupId}/r/{reportId}` e o `canAccessRoute` retorna `true` no client (rota normalizada `/g`) e no server (`/g`).

---

## Task 2 · [a4-cliente-permissoes-11] Firestore rules: fechar write cross-tenant em subcoleções de cliente

**Contexto:** `firestore.rules:38-44` deixa `clients/{clientId}/groups/{groupId}` e `.../reports/{reportId}` com `allow read, write: if request.auth != null` — **qualquer** usuário autenticado escreve nos reports/grupos de **qualquer** cliente (IDOR cross-tenant, adversarial ✓). As escritas legítimas do app passam pelo Admin SDK (rotas `/api/reports`, `/api/report-groups`), que **bypassa** as rules; então restringir o client SDK a admin-ou-tenant não quebra o fluxo.

**Files:**
- Modify: `firestore.rules:38-44`

- [ ] **Step 1: Endurecer a regra**

Substituir o bloco `match /groups/{groupId}` dentro de `match /clients/{clientId}` (linhas 38-44) por:

```
      // Subcoleções de grupos/reports — leitura por tenant/admin; escrita
      // apenas admin ou dono do tenant (fecha IDOR cross-tenant, a4-11).
      // Escritas do app passam pelo Admin SDK (bypassa estas rules).
      match /groups/{groupId} {
        allow read: if request.auth != null
          && (isAdminEmail() || request.auth.token.clientId == clientId);
        allow write: if isAdminEmail() || request.auth.token.clientId == clientId;

        match /reports/{reportId} {
          allow read: if request.auth != null
            && (isAdminEmail() || request.auth.token.clientId == clientId);
          allow write: if isAdminEmail() || request.auth.token.clientId == clientId;
        }
      }
```

(`isAdminEmail()` já é helper definido em `firestore.rules:20-24`; `clientId` é o wildcard do `match /clients/{clientId}`.)

- [ ] **Step 2: Verificar a sintaxe das rules (compilação)**

Como o repo não tem `@firebase/rules-unit-testing` nem `firebase-tools` como dependência, a validação é feita pelo usuário no ambiente com Firebase CLI:

Run (ambiente do usuário, não CI): `firebase deploy --only firestore:rules --dry-run`
Expected: compila sem erro de sintaxe.

Verificação manual do comportamento (checklist, não automatizada):
- Usuário com `token.clientId == 'vila-rosa'` consegue ler `clients/vila-rosa/groups/*` e **não** consegue escrever em `clients/outro/groups/*`.
- Admin (`@askliquid.com`) lê e escreve em qualquer cliente.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "fix(rules): fecha write cross-tenant em clients/{id}/groups|reports (a4-11)"
```

> **Nota de deploy:** as rules só valem em produção após `firebase deploy --only firestore:rules` (decisão/execução do usuário — envolve produção). O commit não altera produção sozinho.

---

## Task 3 · [a3-templates-12] Escrita de templates globais exige admin

**Contexto:** `app/api/dashboard-templates/route.ts` faz só `verifyAuthToken` em POST/PATCH/DELETE (linhas 50, 130, 149) — qualquer usuário autenticado (não-admin) cria/edita/**apaga** templates globais. Templates são recurso global (não tenant-bound), então escrita deve ser admin-only, como já é para `products`/`groups` nas Firestore rules.

**Files:**
- Modify: `app/api/dashboard-templates/route.ts` (POST:49-52, PATCH:129-132, DELETE:148-151)
- Create: `app/api/dashboard-templates/__tests__/admin-guard.test.ts`

**Interfaces:**
- Consumes: `verifyAuthToken(req): Promise<string | null>` (`@/shared/lib/api-auth`), `isAdminEmail(email?): boolean` (`@/shared/lib/runtime-config`).

- [ ] **Step 1: Escrever o teste que falha**

```ts
// app/api/dashboard-templates/__tests__/admin-guard.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/lib/api-auth', () => ({ verifyAuthToken: vi.fn() }));
vi.mock('@/shared/lib/runtime-config', () => ({ isAdminEmail: vi.fn() }));
vi.mock('@/shared/lib/firebase/admin', () => ({ getDb: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) }) }));

import { verifyAuthToken } from '@/shared/lib/api-auth';
import { isAdminEmail } from '@/shared/lib/runtime-config';
import { POST, DELETE } from '../route';

beforeEach(() => vi.clearAllMocks());

function req(body: unknown, url = 'http://x/api/dashboard-templates') {
  return new Request(url, { method: 'POST', body: JSON.stringify(body) });
}

describe('dashboard-templates escrita exige admin', () => {
  it('POST de não-admin retorna 403', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue('user@cliente.com');
    vi.mocked(isAdminEmail).mockReturnValue(false);
    const res = await POST(req({ id: 'x', name: 'X' }));
    expect(res.status).toBe(403);
  });
  it('DELETE de não-admin retorna 403', async () => {
    vi.mocked(verifyAuthToken).mockResolvedValue('user@cliente.com');
    vi.mocked(isAdminEmail).mockReturnValue(false);
    const res = await DELETE(new Request('http://x/api/dashboard-templates?id=x', { method: 'DELETE' }));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run app/api/dashboard-templates/__tests__/admin-guard.test.ts`
Expected: FAIL — retorna 400/200, não 403 (não há guard de admin).

- [ ] **Step 3: Adicionar o guard de admin**

No topo de `app/api/dashboard-templates/route.ts`, adicionar o import:

```ts
import { isAdminEmail } from '@/shared/lib/runtime-config';
```

Em cada um de POST, PATCH e DELETE, trocar o guard de auth inicial. Padrão (aplicar aos três; POST mostrado):

```ts
export async function POST(req: Request) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!isAdminEmail(email)) return NextResponse.json({ error: 'Apenas admin' }, { status: 403 });
  try {
```

O `GET` (linha 29) permanece só com `verifyAuthToken` (leitura é para qualquer autenticado — a galeria precisa).

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm vitest run app/api/dashboard-templates/__tests__/admin-guard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/dashboard-templates/route.ts app/api/dashboard-templates/__tests__/admin-guard.test.ts
git commit -m "fix(templates): escrita de templates globais exige admin (a3-12)"
```

---

## Task 4 · [a4-cliente-permissoes-03] Embedded mode: validar `origin` do postMessage

**Contexto:** `AuthProvider.tsx:54-59` aceita `AUTH_TOKEN` de **qualquer** origem (`event.origin` não é checado) e concede `embeddedMode=true` (que, via `useUserPermissions.tsx:45`, vira `isAdmin=true` incondicional). Qualquer página que embuta o app num iframe injeta um token e ganha admin. Fix: validar `event.origin` contra allowlist e mandar o `AUTH_READY` para origem específica.

**Files:**
- Create: `src/features/auth/lib/embed-origin.ts`
- Create: `src/features/auth/lib/__tests__/embed-origin.test.ts`
- Modify: `src/features/auth/providers/AuthProvider.tsx:54-64`

**Interfaces:**
- Produces: `getAllowedEmbedOrigins(): string[]` e `isAllowedEmbedOrigin(origin: string): boolean`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/features/auth/lib/__tests__/embed-origin.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isAllowedEmbedOrigin } from '../embed-origin';

const OLD = process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS;
beforeEach(() => { process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS = 'https://shell.askliquid.com,https://app.parceiro.com'; });
afterEach(() => { process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS = OLD; });

describe('isAllowedEmbedOrigin', () => {
  it('aceita origem na allowlist', () => {
    expect(isAllowedEmbedOrigin('https://shell.askliquid.com')).toBe(true);
  });
  it('rejeita origem fora da allowlist', () => {
    expect(isAllowedEmbedOrigin('https://evil.com')).toBe(false);
  });
  it('rejeita quando a allowlist está vazia (fail-closed)', () => {
    process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS = '';
    expect(isAllowedEmbedOrigin('https://shell.askliquid.com')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run src/features/auth/lib/__tests__/embed-origin.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar a allowlist**

```ts
// src/features/auth/lib/embed-origin.ts
/**
 * Allowlist de origens permitidas para o modo embedded (iframe com token do
 * shell pai). Fail-closed: sem env configurada, nenhuma origem é aceita.
 * Env: NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS = lista separada por vírgula.
 */
export function getAllowedEmbedOrigins(): string[] {
  return (process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export function isAllowedEmbedOrigin(origin: string): boolean {
  return getAllowedEmbedOrigins().includes(origin);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm vitest run src/features/auth/lib/__tests__/embed-origin.test.ts`
Expected: PASS.

- [ ] **Step 5: Usar a validação no AuthProvider**

Em `src/features/auth/providers/AuthProvider.tsx`, adicionar o import no topo:

```ts
import { isAllowedEmbedOrigin, getAllowedEmbedOrigins } from '../lib/embed-origin';
```

Substituir o handler + o postMessage de `AUTH_READY` (linhas 54-64) por:

```ts
    const handler = (event: MessageEvent) => {
      if (!isAllowedEmbedOrigin(event.origin)) return; // fail-closed: origem não confiável
      if (event.data?.type === 'AUTH_TOKEN' && typeof event.data.token === 'string') {
        setExternalToken(event.data.token);
        setEmbeddedMode(true);
      }
    };

    window.addEventListener('message', handler);

    // Sinaliza prontidão apenas para origens confiáveis (nunca '*').
    for (const origin of getAllowedEmbedOrigins()) {
      window.parent.postMessage({ type: 'AUTH_READY' }, origin);
    }
```

- [ ] **Step 6: Rodar lint + suíte de auth**

Run: `pnpm vitest run src/features/auth`
Expected: PASS.
Run: `pnpm lint`
Expected: sem erros novos.

- [ ] **Step 7: Commit**

```bash
git add src/features/auth/lib/embed-origin.ts src/features/auth/lib/__tests__/embed-origin.test.ts src/features/auth/providers/AuthProvider.tsx
git commit -m "fix(auth): valida origin do postMessage no embedded mode (a4-03)"
```

> **Nota de config:** definir `NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS` no ambiente onde o embed é usado; adicionar ao `.env.example` (sem valores reais). Se o produto **não** usa embed hoje, a allowlist vazia desliga o modo com segurança.

---

## Task 5 · [a2-metricas-02] Erro de métrica visível no bloco (DoD-1 #9)

**Contexto:** Quando uma métrica falha, `useReportData.ts:92-99` transforma a falha em `rows: []` + `console.error`, e os consumidores (`ReportPage.tsx:99`, `RouteTemplatePage.tsx:57`) só recebem `populatedBlockMap` — o `error` some. O bloco vira **vazio silencioso**, indistinguível de "sem dados". O explore já tem `BlockError` (`src/pages/explore/ui/CanvasBlockRenderer.tsx`); reusar. A mensagem genérica do 500 (`execute-metric.ts:254-257`) é mantida (não vazar SQL) — só o **estado visual** de erro é sinalizado.

**Files:**
- Modify: `src/shared/hooks/useReportData.ts:80-101` (fetch/map) e o retorno do hook
- Modify: `src/pages/report/ui/ReportPage.tsx:99-105`
- Modify: `src/pages/dynamic/ui/RouteTemplatePage.tsx:57` (mesmo padrão do ReportPage)

**Interfaces:**
- Produces: `useReportData(...)` passa a retornar `{ populatedBlockMap, loading, errorsByMetric: Record<string, string> }` (chave = metricId, valor = mensagem de erro). Blocos cujo `metricId` está em `errorsByMetric` renderizam `BlockError`.

- [ ] **Step 1: Escrever o teste que falha (mapa de erros a partir da resposta do batch)**

```ts
// src/shared/hooks/__tests__/report-data-errors.test.ts
import { describe, it, expect } from 'vitest';
import { collectMetricErrors } from '../useReportData';

describe('collectMetricErrors', () => {
  it('coleta erro por métrica que falhou', () => {
    const results = {
      'covenants.indice_recebivel': { ok: true, data: [{ v: 1 }] },
      'covenants.obra_serie': { ok: false, error: 'Erro ao executar métrica' },
    };
    expect(collectMetricErrors(results)).toEqual({ 'covenants.obra_serie': 'Erro ao executar métrica' });
  });
  it('sem falhas → objeto vazio', () => {
    expect(collectMetricErrors({ a: { ok: true, data: [] } })).toEqual({});
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run src/shared/hooks/__tests__/report-data-errors.test.ts`
Expected: FAIL — `collectMetricErrors` não existe.

- [ ] **Step 3: Extrair e exportar `collectMetricErrors` em useReportData**

Em `src/shared/hooks/useReportData.ts`, adicionar a função pura (exportada) e usá-la no fluxo do batch (junto do `map` das linhas 89-100):

```ts
export function collectMetricErrors(
  results: Record<string, { ok: boolean; data?: unknown[]; error?: string }>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [id, r] of Object.entries(results)) {
    if (!r?.ok) errors[id] = r?.error ?? 'Falha ao carregar métrica';
  }
  return errors;
}
```

Fazer o fetch reter esses erros (ao lado do `Map` existente) e o hook retorná-los em `errorsByMetric`. Mantém o comportamento de `rows: []` (não derruba a página), mas agora expõe o erro.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm vitest run src/shared/hooks/__tests__/report-data-errors.test.ts`
Expected: PASS.

- [ ] **Step 5: Renderizar `BlockError` nos consumidores**

Em `ReportPage.tsx` e `RouteTemplatePage.tsx`, desestruturar `errorsByMetric` do `useReportData` e, ao renderizar cada bloco, se `block.metricId && errorsByMetric[block.metricId]`, renderizar `<BlockError message={errorsByMetric[block.metricId]} />` (importado de `@/pages/explore/ui/CanvasBlockRenderer` ou do módulo onde `BlockError` está definido) em vez do bloco vazio. Manter a mensagem genérica.

- [ ] **Step 6: Rodar suíte de report + lint**

Run: `pnpm vitest run src/shared/hooks src/pages/report`
Expected: PASS.
Run: `pnpm lint`
Expected: sem erros novos.

- [ ] **Step 7: Commit**

```bash
git add src/shared/hooks/useReportData.ts src/shared/hooks/__tests__/report-data-errors.test.ts src/pages/report/ui/ReportPage.tsx src/pages/dynamic/ui/RouteTemplatePage.tsx
git commit -m "fix(report): erro de métrica vira BlockError visível, não bloco vazio (a2-metricas-02)"
```

---

## Task 6 · [a3-templates-01] `productRefs: ['play']` → `['liquid-play']` (galeria)

**Contexto:** Os 10 templates Play declaram `productRefs: ['play']` (`visao-geral.template.mjs:17` etc.), mas o produto `play` foi renomeado para `play-legacy` e arquivado; a galeria escopa por produtos assinados (`productBindings`), então clientes no formato novo **não veem** nenhum desses 10. Não há alias `play → liquid-play`. Fix: migrar as refs para `liquid-play`.

**Files:**
- Modify: os 10 `scripts/templates/*.template.mjs` com `productRefs: ['play']` (`visao-geral`, `contratos`, `pagamentos`, `fluxo-caixa`, `pdd`, `pricing`, `simulacao-ltv`, `repasse`, `detalhamento`, `inadimplencia`)
- Modify: `src/widgets/nav-sidebar/ui/__tests__/TemplateGallery.test.tsx` (caso productBindings)

- [ ] **Step 1: Confirmar os arquivos afetados**

Run: `pnpm vitest run --reporter=dot 2>/dev/null; grep -rl "productRefs: \['play'\]" scripts/templates/`
Expected: lista os 10 arquivos (`grep` puro; sem executar seed).

- [ ] **Step 2: Estender o teste da galeria (falha)**

Em `src/widgets/nav-sidebar/ui/__tests__/TemplateGallery.test.tsx`, adicionar um caso: cliente com `productBindings` incluindo `liquid-play` vê o template `visao-geral`; e assertar que **nenhum** template retornado tem `productRefs` contendo `'play'` (órfão). (Seguir o padrão dos casos existentes em `:90-109`.)

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `pnpm vitest run src/widgets/nav-sidebar/ui/__tests__/TemplateGallery.test.tsx`
Expected: FAIL — `visao-geral` (com `['play']`) não aparece para cliente `liquid-play`.

- [ ] **Step 4: Migrar as refs nos 10 templates**

Em cada um dos 10 arquivos, trocar `productRefs: ['play'],` por `productRefs: ['liquid-play'],`.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `pnpm vitest run src/widgets/nav-sidebar/ui/__tests__/TemplateGallery.test.tsx`
Expected: PASS.

- [ ] **Step 6: Rodar a suíte de templates estáticos (parse dos .mjs)**

Run: `pnpm vitest run scripts/metrics/__tests__`
Expected: PASS (o parse dos templates continua válido).

- [ ] **Step 7: Commit**

```bash
git add scripts/templates/ src/widgets/nav-sidebar/ui/__tests__/TemplateGallery.test.tsx
git commit -m "fix(templates): migra productRefs play->liquid-play (galeria visível a clientes com bindings) (a3-01)"
```

> **Nota de deploy:** os templates só mudam em produção após re-seed (`pnpm seed:play-templates` ou equivalente) — decisão/execução do usuário, com dry-run + guarda anti-sobrescrita. O commit altera só o repo.

---

## Fora deste plano (planos/decisões separados)

- **`a2-metricas-01` (filter-values 422 nos dropdowns `/g`)** — está no caminho crítico DoD-1, mas o *conserto exato* depende de rastrear por que o `contractRef` do binding do Vila Rosa não casa com o prefixo do `attribute` (`filter-values/route.ts:49,61`), e o pass adversarial está pendente. **Próximo passo:** task de investigação (reproduzir com o binding real do Vila Rosa) antes de escrever o fix — não incluída aqui para não fabricar código.
- **`a4-cliente-permissoes-12` (provisionamento de credencial)** — esforço G e exige **decisão de produto** (fluxo de convite? Admin cria credencial via Admin SDK? SSO?). Precisa de brainstorming próprio antes de plano.
- **WS-4 (IA/DoD-2), WS-0 (dados/compliance), WS-5 (higiene)** — planos separados; vários dependem da auditoria pendente (E9-frontend, OPS) e do pass adversarial.

## Self-review (feito)

- **Cobertura:** cada task mapeia a 1 achado confirmado do backlog (ids no título); o caminho crítico DoD-1 (Tasks 1, 6 + a2-metricas-01 diferido com justificativa) e a segurança cross-tenant adversarial-✓ (Tasks 2, 4) + escrita global (Task 3) + estado de erro (Task 5) estão cobertos.
- **Placeholders:** nenhum "TODO/TBD"; todo passo de código mostra o código; comandos com expected output reais (`pnpm vitest run <arquivo>`, harness confirmado: Vitest 4).
- **Consistência de tipos:** `normalizeRoute` e `ROUTE_GROUPS` (Task 1), `isAllowedEmbedOrigin`/`getAllowedEmbedOrigins` (Task 4) e `collectMetricErrors`/`errorsByMetric` (Task 5) são usados com a mesma assinatura onde produzidos e consumidos.
- **Honestidade de teste:** Task 2 (Firestore rules) não tem harness unitário no repo (`@firebase/rules-unit-testing` ausente) → verificação via Firebase CLI do usuário, declarada como manual em vez de teste fabricado.
