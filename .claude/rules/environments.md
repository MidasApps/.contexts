# Environments — regra sempre-ativa

Ambientes (`local`, `dev`, `staging`, `prod`) são paridade lógica com isolamento de dados e credenciais. Nenhum código tem "if env === prod" para lógica de negócio.

## Princípios
- Quatro ambientes, e só quatro: `local` (máquina do dev, emulators), `dev` (preview por PR, descartável), `staging` (paridade com prod, auto a partir de `main`), `prod` (via tag/aprovação). Nunca pular `staging`.
- Paridade: mesma versão de runtime (Node 26; Functions `nodejs24` em todos os ambientes, ADR 0004 E1), libs, schema de DB. Diferenças = configuração, não código.
- Configuração via env vars / secret manager — nunca hardcoded por ambiente.
- Credenciais isoladas: chaves de staging não funcionam em prod e vice-versa.
- URLs/regions/IDs externos vêm de config; `NEXT_PUBLIC_API_URL` etc.
- Sem cross-env leakage: `dev` não chama API de `prod`, `staging` não escreve em fila de `prod`.
- Feature flags > branches longas para "ainda não pronto pra prod".
- `NODE_ENV` governa libs (`development` só em `local`; `production` em dev/staging/prod). Ambiente lógico é `APP_ENV` (`local`|`dev`|`staging`|`prod`).

## Checklist (aplicar a todo turn)
- [ ] Toda config externa vem do `env` validado por Zod no boot, nunca literal.
- [ ] `.env.example` lista todas as vars com placeholder.
- [ ] Sem `if (env === "prod")` em código de domínio.
- [ ] Secrets de staging ≠ prod.
- [ ] Webhook/queue URL configurável por ambiente.
- [ ] Logs incluem `env` field.

## Anti-patterns
- `const API = isDev ? "http://localhost" : "https://api.com"` → `env.API_URL`.
- Apontar staging para DB de prod "só para testar" → corrompe dados reais.
- Diferenças silenciosas de versão entre dev e prod → CI verifica lockfile.

## Mini-exemplo
```ts
// src/env.ts (server-only; contracts/secrets.md §5.4) — resto do código importa `env` de `@/env`, nunca lê process.env
const EnvSchema = z.object({
  API_URL: z.url(),
  APP_ENV: z.enum(["local", "dev", "staging", "prod"]),
});
export const env = EnvSchema.parse(process.env); // env inválida = falha no boot (intencional)
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/processes/environments.md`
