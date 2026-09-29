# Embedded Mode — Autenticacao via postMessage

## Contexto

O Liquid Artifact e uma aplicacao "shell" que renderiza apps filhas em iframes. Para evitar que o usuario precise logar duas vezes (uma no shell, outra no dataviz), o shell propaga o Firebase ID Token via `window.postMessage`.

Este documento descreve as alteracoes feitas no dataviz para suportar esse modo embedded, a analise de seguranca e os dois cenarios de deploy (mesmo dominio vs dominios diferentes).

## Como Funciona

### Handshake Bidirecional

```
Shell (pai)                        DataViz (iframe)
  |                                      |
  |  iframe.onload                       |
  |                                      |
  |                      <-------------- | postMessage({ type: 'AUTH_READY' })
  |                                      |
  |  postMessage({                       |
  |    type: 'AUTH_TOKEN',     --------> | addEventListener('message')
  |    token: 'eyJhbG...'               |   -> valida event.origin
  |  }, targetOrigin)                    |   -> salva token em memoria
  |                                      |   -> usa em fetch headers
  |                                      |
  |  onIdTokenChanged(user) =>           |
  |  postMessage({ token }) -----------> | atualiza token
```

1. DataViz carrega no iframe e detecta que esta embedded (`window.parent !== window`)
2. Envia `{ type: 'AUTH_READY' }` para o parent
3. Shell responde com `{ type: 'AUTH_TOKEN', token: '<firebase-id-token>' }`
4. DataViz armazena o token em memoria e usa nas chamadas de API
5. Quando o token e renovado pelo shell (via `onIdTokenChanged`), um novo `AUTH_TOKEN` e enviado

## Arquivos Alterados no DataViz

### Criado: `src/shared/lib/external-token.ts`

Store em memoria para o token externo recebido via postMessage.

```typescript
getExternalToken()   // Retorna o token ou null
setExternalToken()   // Armazena o token
hasExternalToken()   // Verifica se existe token externo
```

### Alterado: `src/features/auth/providers/AuthProvider.tsx`

- Adicionado estado `embeddedMode` (ativado quando recebe `AUTH_TOKEN` via postMessage)
- Listener de `postMessage` registrado no mount (apenas se `window.parent !== window`)
- Envia `AUTH_READY` ao parent quando listener esta pronto
- `embeddedMode` exposto no `AuthContextValue`
- Skip de redirect para `/login` quando embedded
- Renderizacao imediata (sem bloquear por auth) quando embedded

### Alterado: `src/features/auth/ui/ProtectedRoute.tsx`

- Adicionado bypass: quando `embeddedMode = true`, renderiza `{children}` diretamente sem verificar permissoes
- Logica: autenticacao e autorizacao sao responsabilidade do shell pai

### Alterado: `src/shared/hooks/useUserPermissions.tsx`

- `isAdmin = true` quando `embeddedMode` ativo
- Bypassa todo o RBAC (groups, clientAccess, routeOverrides)
- Permissoes nao sao carregadas do Firestore em embedded mode

### Alterado: `src/shared/hooks/useQuery.ts`

- `getAuthToken()` verifica primeiro se existe token externo (`getExternalToken()`)
- Se existe, retorna ele diretamente (sem chamar Firebase `getIdToken()`)
- Fallback para `user.getIdToken()` quando nao esta em embedded mode

### Alterado: `src/shared/hooks/useClients.ts`

- `fetchClients()` aceita chamada sem Firebase User (usa token externo)
- Listener de `postMessage` para disparar fetch quando token chega
- Check imediato apos setup: se token externo ja existe, inicia polling
- `onAuthStateChanged` ignorado quando ha token externo

## Comportamento

| Cenario | Acesso direto | Embedded (iframe) |
|---------|--------------|-------------------|
| Login | Firebase Auth (Google/email) | Token do shell via postMessage |
| Token API | `user.getIdToken()` | `getExternalToken()` |
| Permissoes | RBAC via Firestore | Bypass (admin) — POC |
| ProtectedRoute | Verifica user + permissoes | Bypass |
| Redirect /login | Sim, se nao logado | Nao (embeddedMode) |

---

## Analise de Seguranca

### O que esta protegido

- **API routes server-side** — continuam validando o token via Firebase Admin SDK `verifyIdToken()`. Nenhum acesso sem token valido.
- **Token e real** — precisa ser um Firebase ID Token legitimo do projeto Firebase compartilhado.
- **Shell envia com targetOrigin** — o shell nunca usa `'*'` ao enviar o token, mitigando interceptacao por iframes vizinhos.

### Riscos da POC

| Risco | Severidade | Descricao |
|-------|-----------|-----------|
| RBAC bypassado | Alta | Em embedded mode, `isAdmin = true`. Usuario com acesso a 1 cliente ve todos. Independe do cenario de dominio. |
| Sem validacao de origin no listener | Media | O dataviz aceita `AUTH_TOKEN` de qualquer origem. Um site malicioso poderia embedar o dataviz e enviar um token. |
| Sem CSP frame-ancestors | Media | Qualquer dominio pode embedar o dataviz num iframe. |
| Hooks nao adaptados | Baixa | `useAdminUsers`, `useAdminGroups`, `useAdminClients`, `AISidebar`, `InlineAIChat` usam `getIdToken()` diretamente e nao funcionarao em embedded mode. |

### Fixes necessarios para producao

1. **Validar `event.origin`** no listener do dataviz
2. **Adicionar CSP `frame-ancestors`** para restringir quem pode embedar
3. **Propagar permissoes reais** — carregar RBAC do usuario autenticado via token em vez de bypassar
4. **Adaptar hooks restantes** para usar `getExternalToken()` como fallback

---

## Cenarios de Deploy

### Cenario 1: Mesmo dominio

Exemplo: `app.askliquid.com` (shell) e `dataviz.askliquid.com` (dataviz), ou `app.askliquid.com/shell` e `app.askliquid.com/dataviz`.

#### Vantagens

- CSP `frame-ancestors` pode restringir a `*.askliquid.com` — nenhum site externo consegue embedar
- Validacao de `event.origin` trivial — aceitar apenas `*.askliquid.com`
- Cookies podem ser compartilhados (mesmo dominio root com `domain=.askliquid.com`) — possibilita session cookie no futuro, eliminando postMessage
- Risco de embedding malicioso eliminado

#### Configuracao no DataViz (app filha)

**Next.js headers** — adicionar em `next.config.ts`:

```typescript
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://*.askliquid.com",
          },
          {
            key: 'X-Frame-Options',
            value: 'ALLOW-FROM https://app.askliquid.com',
          },
        ],
      },
    ];
  },
};
```

**Validacao de origin no AuthProvider** — alterar o listener:

```typescript
const ALLOWED_ORIGINS = [
  'https://app.askliquid.com',
  'https://shell.askliquid.com',
];

const handler = (event: MessageEvent) => {
  if (!ALLOWED_ORIGINS.includes(event.origin)) return;
  // ... processar AUTH_TOKEN
};
```

**Cloud Run** — se usando Cloud Run, configurar o header via `Dockerfile` ou middleware.

#### Configuracao no Liquid Artifact (shell)

Nenhuma configuracao especial necessaria. O shell ja envia `postMessage` com `targetOrigin` especifico extraido da URL do artefato.

Para Cloud Run no mesmo dominio, configurar rotas no load balancer:
- `app.askliquid.com/*` -> Cloud Run do shell
- `dataviz.askliquid.com/*` -> Cloud Run do dataviz

Ou com path-based routing:
- `app.askliquid.com/dataviz/*` -> Cloud Run do dataviz (requer rewrite no shell)

#### Riscos residuais

| Risco | Status |
|-------|--------|
| Embedding malicioso | Eliminado (CSP) |
| postMessage de origem desconhecida | Eliminado (origin check) |
| RBAC bypassado | **Ainda presente** — requer fix independente |

---

### Cenario 2: Dominios diferentes

Exemplo: `liquid-artifact-xxx.a.run.app` (shell) e `liquid-dataviz-xxx.a.run.app` (dataviz).

Tambem se aplica a localhost com portas diferentes (`localhost:3040` e `localhost:3020`).

#### Desafios

- CSP `frame-ancestors` precisa listar cada dominio explicitamente
- URLs do Cloud Run mudam a cada deploy (sufixo aleatorio) — CSP precisa ser dinamico ou usar dominio customizado
- Validacao de `event.origin` precisa de lista de origens permitidas configuravel via env var
- Cookies NAO sao compartilhados entre dominios diferentes — postMessage e obrigatorio

#### Configuracao no DataViz (app filha)

**Env var para origens permitidas** — adicionar ao `.env.local`:

```env
NEXT_PUBLIC_ALLOWED_SHELL_ORIGINS=https://liquid-artifact-xxx.a.run.app,http://localhost:3040
```

**Next.js headers** — adicionar em `next.config.ts`:

```typescript
const shellOrigins = process.env.NEXT_PUBLIC_ALLOWED_SHELL_ORIGINS?.split(',') || [];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors 'self' ${shellOrigins.join(' ')}`,
          },
        ],
      },
    ];
  },
};
```

**Validacao de origin no AuthProvider** — usar a env var:

```typescript
const ALLOWED_ORIGINS = (
  process.env.NEXT_PUBLIC_ALLOWED_SHELL_ORIGINS?.split(',') || []
);

const handler = (event: MessageEvent) => {
  if (!ALLOWED_ORIGINS.includes(event.origin)) return;
  // ... processar AUTH_TOKEN
};
```

#### Configuracao no Liquid Artifact (shell)

O componente `ArtifactFrame` ja extrai `targetOrigin` da URL do artefato e envia com origem correta. Nenhuma mudanca necessaria.

O iframe ja usa `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`.

#### Riscos residuais

| Risco | Status |
|-------|--------|
| Embedding malicioso | Mitigado (CSP com lista explicita) |
| postMessage de origem desconhecida | Mitigado (origin check via env var) |
| RBAC bypassado | **Ainda presente** — requer fix independente |
| URLs dinamicas do Cloud Run | Requer dominio customizado ou CSP dinamico |

---

## Comparativo dos Cenarios

| Aspecto | Mesmo dominio | Dominios diferentes |
|---------|--------------|-------------------|
| CSP frame-ancestors | `*.askliquid.com` (simples) | Lista explicita de URLs (fragil) |
| Origin validation | Wildcard no dominio | Lista por env var |
| Cookies compartilhados | Sim (futuro: eliminar postMessage) | Nao (postMessage obrigatorio) |
| Setup de infra | Load balancer com routing | Independente (mais simples) |
| Seguranca | Mais robusto | Depende de configuracao correta |
| RBAC | Precisa fix | Precisa fix |

## Recomendacao

Para producao, usar **mesmo dominio** (Cenario 1) com subdominio por app. Isso simplifica seguranca, permite evolucao para session cookies, e elimina a classe inteira de riscos de cross-origin.

O fix de RBAC e obrigatorio independente do cenario — a abordagem recomendada e decodificar o UID do token externo server-side e carregar as permissoes desse usuario normalmente.

---

## Limitacoes da POC

- Em embedded mode, todas as permissoes sao bypassadas (trata como admin)
- Nao ha validacao de origem no listener do dataviz (aceita qualquer parent)
- Se o token expirar e o shell nao reenviar, as chamadas de API falharao silenciosamente
- Apenas `useQuery.ts` e `useClients.ts` foram adaptados para token externo — outros hooks que usam `getIdToken()` diretamente (admin, AI sidebar) nao funcionarao em embedded mode
