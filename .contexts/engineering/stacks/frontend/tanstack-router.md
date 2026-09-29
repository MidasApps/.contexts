---
title: TanStack Router
type: stacks
category: frontend
version: 1.170.40
last_updated: 2026-09-29
status: current
upstream: https://tanstack.com/router/latest/docs/framework/react/overview
vite_upstream: https://tanstack.com/router/latest/docs/framework/react/installation/with-vite
next_target: 1.x minors
---

# TanStack Router

Roteador do `apps/desktop` (SPA Vite dentro do Tauri 2). No `apps/web`, quem roteia é o App Router do Next 16. As duas superfícies consomem as mesmas telas de `packages/client` por um port de roteamento em `shared/lib/router`, e este documento cobre o adapter TanStack desse port. Decisão: `@.contexts/engineering/decisions/0007-desktop-and-mobile-shell-with-tauri-2.md`.

**Escopo:** setup file-based, registro de tipos, search params, guards, code splitting e o adapter do port. Bundler: `@.contexts/engineering/stacks/frontend/vite.md`. Shell: `@.contexts/engineering/stacks/desktop/tauri@2.md`. Camadas FSD: `@.contexts/engineering/architecture/fsd.md`.

## Versão

Medido em 2026-09-29 (`npm view`):

| Pacote | Versão | Nota |
|---|---|---|
| `@tanstack/react-router` | **1.170.40** | Peer React `>=18 \|\| >=19` (React 19.3 ok), engines Node `>=20.19`. Tags `pre`, `alpha`, `beta` não são versão (ADR 0004). |
| `@tanstack/router-plugin` | 1.168.41 | Plugin de Vite; linha de versão própria, peer `@tanstack/react-router ^1.170.40`. |

`@tanstack/react-router` é `dependency` de `apps/desktop`, e o plugin é `devDependency`. `packages/client` não depende de nenhum dos dois.

## Setup file-based

- O plugin (`tanstackRouter({ target: "react", autoCodeSplitting: true })`) vem **antes** de `@vitejs/plugin-react` no `vite.config.ts`.
- Rotas em `apps/desktop/src/routes/` (default `routesDirectory`); raiz em `__root.tsx`. O plugin gera `src/routeTree.gen.ts`.
- `routeTree.gen.ts` é gerado: não edite à mão e exclua do ESLint e do formatter. O `typecheck` do CI precisa dele. Garanta que o arquivo exista antes do `tsc --noEmit`, versionado ou gerado num passo anterior (a escolha fica para a implementação).
- Arquivo de rota só compõe (ADR 0006): importa a view de `@core/client` e declara loader, guard e search. A tela em si não mora aqui.

```tsx
// apps/desktop/src/routes/projects.$projectId.tsx
import { createFileRoute } from "@tanstack/react-router";
import { ProjectOverviewView } from "@core/client";
import { ProjectSearchSchema } from "@core/contracts";

export const Route = createFileRoute("/projects/$projectId")({
  validateSearch: (search) => ProjectSearchSchema.parse(search),
  component: ProjectOverviewRoute,
});

function ProjectOverviewRoute() {
  const { projectId } = Route.useParams();
  return <ProjectOverviewView projectId={projectId} />;
}
```

Nomes de view, schema e rota acima são ilustrativos; o core não tem domínio de negócio.

## Registro do router

```tsx
// apps/desktop/src/main.tsx
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const router = createRouter({ routeTree, context: { auth: undefined! } });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

- Sem o `Register`, `Link`, `useNavigate` e `useParams` perdem a checagem de rota em tempo de compilação.
- `context` tipado (`createRootRouteWithContext<{ auth: AuthState }>()` no `__root.tsx`) leva auth e clients para `beforeLoad`/`loader` sem import global.

## Search params

- Search param é input externo: passa por schema Zod em `validateSearch` (rule `validation`). Um schema compartilhado com o web mora em `packages/contracts`.
- Nome de parâmetro e formato seguem a doutrina de API (`?cursor=`, `?sort=-createdAt`, `@.contexts/engineering/contracts/api.md`) quando o parâmetro espelha uma listagem do `/v1`.

## Guards e dados

- `beforeLoad` redireciona quem não tem sessão (`throw redirect({ to: "/sign-in" })`). É UX, não autorização: o `/v1` autoriza toda request (rule `security` §3).
- Dados vêm do `/v1`, pelo mesmo cliente HTTP que o web usa. Server state segue `@.contexts/engineering/rules/state-management.md`. O loader do router não vira um segundo cache paralelo à lib de server state.
- **Sem `/admin`**: nenhuma rota de administração é registrada no desktop (ADR 0007).
- `autoCodeSplitting: true` divide cada rota em chunks; não é preciso `lazy()` manual por rota.

## Adapter do port `shared/lib/router`

`packages/client` não importa `next/navigation` nem `@tanstack/react-router`. Views, widgets e features navegam por um port, e cada app injeta seu adapter pelos providers (`apps/<app>/src/app-providers/`, `architecture/monorepo.md`).

```ts
// packages/client/src/shared/lib/router/router-port.ts  (forma ilustrativa)
export type RouterPort = {
  navigate: (to: string, options?: { replace?: boolean }) => void;
  back: () => void;
  usePathname: () => string;
  useSearchParam: (name: string) => string | null;
};
```

```tsx
// apps/desktop/src/app-providers/tanstack-router-adapter.tsx  (forma ilustrativa)
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import type { RouterPort } from "@core/client";

export function useTanstackRouterPort(): RouterPort {
  const navigate = useNavigate();
  const router = useRouter();
  return {
    navigate: (to, options) => void navigate({ to, replace: options?.replace }),
    back: () => router.history.back(),
    usePathname: () => useLocation({ select: (l) => l.pathname }),
    useSearchParam: (name) => useLocation({ select: (l) => new URLSearchParams(l.searchStr).get(name) }),
  };
}
```

- O port expõe só o que as duas implementações cumprem. Recurso exclusivo de um router (loader, `beforeLoad`, Server Component) fica no arquivo de rota do app, fora do port.
- O componente de link do `shared/ui` recebe o `Link` do app via port ou prop. Um `<a href>` cru perde a navegação client-side nos dois apps.
- Paths usados pelas features ficam em constantes de `packages/client`, a fonte única para os dois routers. **Trade-off:** o port recebe `string`, então a checagem de rota do `Register` vale só dentro de `apps/desktop`. Rota inexistente chamada via port aparece em teste, não no compilador.
- Contrato final do port (assinatura e local do componente de link): **não confirmado**, definido na implementação do SP0b. Teste de feature usa um fake em memória do port (rule `testing`).

## Anti-patterns

- `import { Link } from "@tanstack/react-router"` dentro de `packages/client` → port.
- Tela inteira no arquivo de rota em vez de em `views` de `packages/client`.
- `validateSearch` que devolve o objeto cru sem schema.
- Autorizar no `beforeLoad` e confiar nisso no servidor.
- Editar `routeTree.gen.ts` à mão ou deixá-lo no lint.
- Registrar rotas `/admin` no desktop.

## Referências cruzadas

- `@.contexts/engineering/stacks/frontend/vite.md`, `@.contexts/engineering/stacks/desktop/tauri@2.md`
- `@.contexts/engineering/stacks/frontend/next@16.md` (adapter Next do mesmo port)
- `@.contexts/engineering/stacks/frontend/react@19.md`, `@.contexts/engineering/stacks/validation/zod@4.md`
- `@.contexts/engineering/architecture/fsd.md`, `@.contexts/engineering/architecture/monorepo.md`
