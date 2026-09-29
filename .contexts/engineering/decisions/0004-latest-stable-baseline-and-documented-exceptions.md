# 0004. Baseline na última versão estável, com exceções documentadas

- **Status:** accepted
- **Date:** 2026-09-28
- **Deciders:** projeto DDC / dono do framework
- **Tags:** `engineering`, `stacks`, `versions`, `ssot`
- **Supersedes:** a linha de runtime da matriz da [0002](0002-baseline-2026-09-version-and-naming-alignment.md) (Node 24 como baseline, Node 26 fora). Os demais pins da 0002 já estavam na última estável e permanecem.

## Context

A 0002 deixou Node 26 e outros itens de fora "até estabilizar", sem uma regra geral. O dono do framework definiu a regra: **manter a versão mais atualizada; qualquer incompatibilidade vira ADR.** Medição de 2026-09-28 (`npm view`, nodejs.org, postgresql.org, docs do Google Cloud) mostra que todo pacote npm do baseline já está no `latest`. O que sobrava para trás era o que a 0002 excluía por escolha, e não por incompatibilidade comprovada.

## Decision

1. **Última estável vence.** Baseline = `latest` do registry ou release GA/Current do fornecedor. Canary, beta, rc e preview **não são versão**: não entram na matriz e não precisam de ADR (Postgres 19 beta, Next 16.4 canary).
2. **Toda exceção é uma linha na tabela abaixo**, com o fato que a comprova, a data e o gatilho de revisão. Exceção sem linha aqui é erro de documentação.
3. **Node.js 26.10.0 (Current) é o baseline** de app, CI, Docker e tooling. `@types/node@26`, imagem `node:26-alpine`, `engines.node` `>=26.0.0 <27`.
   - Risco aceito: o projeto Node.js recomenda LTS em produção; a 26 vira LTS em **2026-10-28** (Maintenance 2027-10-20, EOL 2029-04-30). A 24 entra em Maintenance em 2026-10-20 (EOL 2028-04-30).
   - Todos os pacotes do baseline aceitam Node 26 (`vitest` `^22.12 || ^24 || >=26`; `ai`, `openai`, `@mastra/core`, `firebase-admin` `>=22`; `next` `>=20.9`).
   - Código compartilhado com Functions (que roda Node 24, ver E1) não usa API removida na 26: `http.Server#writeHeader`, módulos `_stream_*`, `--experimental-transform-types`. `module.register()` está deprecated em runtime: use `module.registerHooks()`.

## Exceções (incompatibilidade comprovada)

| # | Pacote / runtime | Última | Baseline | Incompatibilidade | Revisar quando |
|---|---|---|---|---|---|
| E1 | Runtime de **Firebase / Cloud Functions** | Node 26 | `nodejs24` | A página de runtime support do Cloud Functions lista `nodejs24` como o mais novo (default `google-24`, EOL 2028-04-30) e não tem `nodejs26`. `engines` do pacote de functions fica `>=24.0.0 <25`. | O Google publicar `nodejs26` |
| E2 | **typescript-eslint** 8.71.0 | TS 7 | API do TS 6 via `@typescript/typescript6@6.0.2` | Peer `typescript >=4.8.4 <6.1.0` não aceita TS 7. O `tsc` e o `next build` seguem no 7; só o lint recebe a API 6 (hook `readPackage`, ver `stacks/language/typescript@7.md`). | typescript-eslint aceitar TS 7 ou o TS 7.1 expor a API |
| E3 | **ESLint** 10.11.0 | 10.x | **9.39.5** | `eslint-plugin-react@7.37.5` (a última publicada) declara peer `eslint ^9.7`. `eslint-config-next@16.3.6` aceita `>=9`, mas o plugin entra por ele. | `eslint-plugin-react` publicar suporte a ESLint 10 |
| E4 | **@mastra/evals** 1.10.3 | 1.10.3 | fora do baseline | Peer `vitest >=3.0.0 <5.0.0`, incompatível com Vitest 5.0.2. Evals seguem no harness próprio (`stacks/ai/harness-engineering.md`). | O peer aceitar Vitest 5 |
| E5 | **@playwright/experimental-ct-react** 1.62.1 | 1.62.1 | não adotado | Depende de `@playwright/experimental-ct-core` **exato** 1.62.1, uma versão atrás de `@playwright/test` 1.63.0. Testes de componente rodam no Vitest (browser mode). | O pacote acompanhar o `@playwright/test` |
| E6 | Runtime do **Firebase App Hosting** (`apps/web`, ADR 0009) — **provisória** | Node 26 | `nodejs24` | Medido em 2026-09-29: o App Hosting "supports even-numbered Node.js versions, mirroring Cloud Run's support", e a página de runtimes do Cloud Run lista `nodejs26` só como **Preview**. Pela regra 1 (preview não é versão), o mais novo GA é `nodejs24`. `apps/web` declara `engines.node` `>=24.0.0 <27` com `@types/node@24` como guarda; local e CI rodam Node 26, o App Hosting escolhe `nodejs24` em prod. Provisória até o spike de App Hosting (primeira task do SP0b). | `nodejs26` GA no Cloud Run/App Hosting, **ou** falha do spike (o `apps/web` passa a Next standalone no Cloud Run com `node:26`, e a E6 sai) |

## Não são exceções (informativo)

- **PostgreSQL:** 18.6 é a última versão suportada (postgresql.org/support/versioning). O 19 não tem release; segue em beta.
- **Next.js:** 16.3.6 é o `latest`. 16.4 é canary. Subir para 16.3.7 quando publicar.
- **Firebase App Hosting:** a doc oficial não lista versões de Node; o runtime é escolhido no backend ("a mais nova recomendada vem pré-selecionada"). O framework não afirma versão para ele: confira a oferecida no console.
- **Majors de `@ai-sdk/*`** não acompanham a major de `ai` (ver `stacks/VERSIONS.md`).

## Consequences

- `stacks/runtime/node@24.md` passa a `node@26.md`; a skill `node-24` passa a `node-26`.
- A matriz de `MEMORY.md` e `stacks/VERSIONS.md` mostram Node 26 como baseline e citam E1 a E5 nas linhas afetadas.
- Deixa de valer a invariante "todo JS/TS roda em Node 24": app, CI e tooling rodam em 26; **só o deploy de Functions** roda em 24.
- Um pacote que ficar atrás do `latest` sem linha nesta tabela é bug de documentação, e a próxima medição o pega.

## References

- [0002](0002-baseline-2026-09-version-and-naming-alignment.md), `stacks/VERSIONS.md`, `MEMORY.md`
- https://nodejs.org/en/blog/release/v26.0.0
- https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
- https://docs.cloud.google.com/functions/docs/runtime-support
- https://www.postgresql.org/support/versioning/

## Amendments

- **2026-09-29 (conformidade, SP0a Task 4 / ADR 0009):** a nota informativa "Firebase App Hosting: a doc oficial não lista versões de Node" em "Não são exceções" está **retirada**: a doc de 2026-09-24 declara suporte a versões pares espelhando o Cloud Run, e o runtime do App Hosting passou a ser a exceção E6. Nas Consequences, leia "citam E1 a E6" no lugar de "E1 a E5" e "só o deploy de Functions (E1) e o runtime de prod do `apps/web` no App Hosting (E6) rodam em 24" no lugar de "só o deploy de Functions roda em 24". A decisão (última estável, exceções em tabela) não muda.
