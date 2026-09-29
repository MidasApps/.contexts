---
title: Grounding
type: rule
status: active
scope: engineering/rules
last_updated: 2026-05-25
---

# Grounding — disciplina anti-alucinação

Antes de escrever qualquer código que referencia algo que não foi inventado neste mesmo turn, verifique que esse algo existe no estado real do projeto. Toda invocação, import, tipo, constante, hook, componente, env var, opção de config ou path de arquivo deve ter sido confirmado por `Read`, `Grep` ou `Glob`. Nunca assuma por plausibilidade.

## Regras

- **Nunca** invente assinatura de função, método, hook ou tipo de outro módulo.
- **Nunca** importe módulo ou pacote sem confirmar que existe em `package.json`, `tsconfig` ou no codebase.
- **Nunca** assuma que uma opção de configuração existe — confira o tipo ou a doc da versão instalada.
- **Nunca** invente nome ou shape de env var — confira `.env.example`, `env.ts` ou schema de config.
- **Nunca** assuma formato de retorno de função alheia sem ler sua fonte ou seus testes.
- **Nunca** use API de uma lib sem confirmar a versão instalada e o que essa versão suporta.
- **Nunca** referencie arquivo ou path sem confirmar existência via `Glob` ou `Read`.
- **Sempre** verifique antes de escrever. Verificação precede geração.

## Checklist procedural (toda edição que gera código)

1. Liste os símbolos externos que o código vai tocar: imports, chamadas, tipos referenciados, constantes lidas, paths de arquivo, env vars.
2. Para cada símbolo do projeto: `Read` o arquivo onde mora OU `Grep` por sua declaração.
3. Para APIs de lib: confira versão em `package.json` E consulte a skill da stack correspondente (ex.: `next-16`, `zod-4`, `anthropic-sdk`), OU `Grep` por uso prévio no codebase para inferir o padrão real.
4. Para env vars e config: `Grep` no schema de validação (`env.ts`, `config.ts`) ou em `.env.example`.
5. Para paths de arquivo: `Glob` ou `Read` para confirmar existência antes de citar.
6. Só depois de verificar, escreva.

## Quando aplicar

Sempre-ativa. Vale em todos os cenários de desenvolvimento — feature nova, manutenção, refator, hotfix, teste, ADR-driven design. Não há exceção para "código simples" ou "óbvio": a alucinação aparece justamente onde a LLM acha que "obviamente" existe.

## Retorno padrão quando não há grounding

Se a verificação não puder ser feita (arquivo inacessível, lib sem doc disponível, versão desconhecida), **pare e pergunte**. Não preencha lacuna com palpite plausível. A resposta correta é declarar a incerteza, não disfarçá-la.

## Anti-patterns

- Chamar função cujo nome "parece certo" sem `Grep` por sua declaração.
- Importar de path que segue a convenção do projeto sem confirmar que o arquivo existe.
- Usar opção de config porque "framework X normalmente tem isso".
- Ler `process.env.ALGO` sem confirmar que `ALGO` está no schema de env.
- Inferir API de lib por memória da versão errada.
- Escrever testes que mockam função inexistente.

## Exemplos

**Errado** — invocar sem verificar:
```ts
import { useAuth } from "@/hooks/use-auth";
const { user } = useAuth();
```
Antes disso: `Glob` em `**/hooks/use-auth.*` e `Read` para confirmar export e shape de retorno.

**Errado** — opção de config inventada:
```ts
// next.config.ts
export default { experimental: { turboMode: true } };
```
Antes disso: confirme em `node_modules/next/dist/.../config.d.ts` ou na skill `next-<versão>` que `turboMode` existe na versão instalada.

**Errado** — env var fantasma:
```ts
const key = process.env.STRIPE_SECRET_KEY;
```
Antes disso: `Grep` por `STRIPE_SECRET_KEY` em `env.ts`, `.env.example`, schema de config. Se não estiver, ou adicione ao schema explicitamente ou pergunte.

**Certo** — fluxo verificado:
```
1. Glob "**/lib/db/*.ts"  → confirma src/lib/db/client.ts
2. Read src/lib/db/client.ts → confirma export `db` e método `db.query`
3. Escreve: import { db } from "@/lib/db/client"; await db.query(...)
```

## Sinais de violação (em code review)

- Função chamada que `Grep` não encontra.
- Import de path que `Glob` não resolve.
- Uso de API de lib divergente da versão em `package.json`.
- Env var lida que não está no schema de config.
- Tipo referenciado que não está exportado por nenhum módulo.
- Opção de config que não aparece nos tipos da versão instalada.

## Relação com outras rules

- @validation cobre validação de input em runtime; grounding é validação de existência em compile-time conceitual.
- @testing cobre que o código tem teste; grounding cobre que o código chama coisas reais.
- @ai-friendly-code regula como o código é estruturado; grounding regula como o código é gerado.
