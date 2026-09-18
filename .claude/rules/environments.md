# Environments — regra sempre-ativa

Ambientes (`dev`, `staging`, `prod`) são paridade lógica com isolamento de dados e credenciais. Nenhum código tem "if env === prod" para lógica de negócio.

## Princípios
- Mínimo: `dev` (local), `staging`/`preview` (idêntico a prod, dados não-prod), `prod`.
- Paridade: mesma versão de runtime, libs, schema de DB. Diferenças = configuração, não código.
- Configuração via env vars / secret manager — nunca hardcoded por ambiente.
- Credenciais isoladas: chaves de staging não funcionam em prod e vice-versa.
- URLs/regions/IDs externos vêm de config; `NEXT_PUBLIC_API_URL` etc.
- Sem cross-env leakage: `dev` não chama API de `prod`, `staging` não escreve em fila de `prod`.
- Feature flags > branches longas para "ainda não pronto pra prod".
- `NODE_ENV=production` no build de staging E prod (otimizações); ambiente lógico vira config separada (`APP_ENV`).

## Checklist (aplicar a todo turn)
- [ ] Toda config externa vem de `process.env.X`, nunca literal.
- [ ] `.env.example` lista todas as vars com placeholder.
- [ ] Sem `if (env === "prod")` em código de domínio.
- [ ] Secrets de staging ≠ prod.
- [ ] Webhook/queue URL configurável por ambiente.
- [ ] Logs incluem `env` field.

## Anti-patterns
- `const API = isDev ? "http://localhost" : "https://api.com"` → `process.env.API_URL`.
- Apontar staging para DB de prod "só para testar" → corrompe dados reais.
- Diferenças silenciosas de versão entre dev e prod → CI verifica lockfile.

## Mini-exemplo
```ts
export const config = {
  apiUrl: required("API_URL"),
  env: required("APP_ENV"), // "dev" | "staging" | "prod"
};
function required(k: string) { const v = process.env[k]; if (!v) throw new Error(`Missing ${k}`); return v; }
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/processes/environments.md`
