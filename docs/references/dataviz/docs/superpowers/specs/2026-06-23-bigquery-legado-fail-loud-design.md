# Caminho legado `/api/bigquery` fail-loud (G9) — Design

> **Status:** aprovado para plano. Fecha a parte **fail-loud** do gap **G9** da
> auditoria. A eliminação completa do caminho legado (migração das páginas fixas
> para a camada semântica) é um track à parte, decomposto ao final desta spec.

## Contexto

As páginas fixas do dashboard (contratos, PDD, elegibilidade, pricing, simulação,
repasse, dashboard, fluxo, pagamentos, detalhamento) consultam dados via
`/api/bigquery` → `src/shared/lib/bigquery/queries.ts`, usando o resolver legado
`schema-resolver.ts` + o `client.schema` top-level (formato nested `ClientSchema`).

O gap G9: quando um campo está **explicitamente marcado indisponível** (mapeado para
`null` no `client.schema`), o helper `col()` o substitui pelo literal `'0'`
(`queries.ts:8-10`: `resolveColumn(...) ?? '0'`). Numa agregação isso vira
`SUM('0') = 0` — a página exibe **zero silenciosamente** em vez de sinalizar que o dado
não existe. É a **semântica oposta** ao caminho semântico novo (fail-loud, ADR-0015 §
resolution rules), e produz números errados em vez de falhar.

Decisões do usuário nesta rodada:
- App **não está em produção** e não se quer **nada legado** ⇒ não investir em
  "melhorar" o caminho legado (ex.: fazê-lo ler `schemaBindings`) — isso seria trabalho
  descartável.
- Logo, o G9 desta rodada faz só a parte **pequena, correta e não-descartável**:
  tornar o legado **fail-loud**. A eliminação completa vira track próprio.
- **Sem flag `NEXT_PUBLIC_SEMANTIC_LAYER`**: o único propósito dele era rollout seguro
  em produção; pré-produção, um flag defaultado-off só preservaria o bug.

Referência: auditoria `docs/auditoria-arquitetura-camada-semantica.md` (G9).

## Escopo desta spec

Apenas o **fail-loud** do caminho legado. O fallback ao **nome canônico** (quando NÃO
há mapping) é **mantido** — é o back-compat legítimo do OM (canônico = coluna real) e de
clientes sem `client.schema`. Somente o caso `null`-explícito (o `'0'`) muda para erro.
Isso não afeta OM nem clientes sem schema.

## Arquitetura

### 1. Erro tipado `FieldUnavailableError`

Em `src/shared/lib/bigquery/schema-resolver.ts`:
```ts
export class FieldUnavailableError extends Error {
  constructor(public readonly table: string, public readonly field: string) {
    super(`Campo indisponível para este cliente: ${table}.${field}`);
    this.name = 'FieldUnavailableError';
  }
}
```

### 2. `col()` fail-loud

Em `src/shared/lib/bigquery/queries.ts`, o helper `col(schema, table, field)` passa de
`return resolveColumn(...) ?? '0';` para:
```ts
function col(schema: Schema, table: string, field: string): string {
  const resolved = resolveColumn(schema, table, field);
  if (resolved === null) throw new FieldUnavailableError(table, field);
  return resolved;
}
```
`resolveColumn` retorna `null` **apenas** no mapping explícito `null` — então o throw
ocorre só nesse caso. Sem schema / sem mapping ⇒ retorna o nome (canônico/real),
comportamento inalterado.

### 3. Route mapeia o erro para 422

Em `app/api/bigquery/route.ts`, o `catch` passa a distinguir o erro:
```ts
} catch (error) {
  if (error instanceof FieldUnavailableError) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  console.error('[BigQuery API Error]', error);
  return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
}
```
O 422 nomeia o campo (mensagem segura — não vaza SQL/topologia). Demais erros seguem
500 genérico.

## Consequência (explícita)

O caminho legado faz **query por página em bundle** (vários campos numa query só), então
um campo indisponível faz a **página inteira** retornar 422 — granularidade mais grossa
que o per-métrica do caminho novo. É aceitável e desejado: falhar visível > mostrar zero
errado, e pressiona a migração. A página só quebra para cliente que marcou
explicitamente um campo como indisponível (mapping `null`).

## Error handling

- Campo `null`-mapeado em agregação ⇒ `FieldUnavailableError` ⇒ 422 nomeando o campo.
- Sem schema / sem mapping ⇒ nome canônico/real (inalterado).
- WHERE-clauses já são fail-safe hoje (pulam o filtro quando a coluna é `null`) — **não
  mudam** (filtrar é opcional; agregar um campo inexistente é que é erro).
- Erros de BQ/Firestore ⇒ 500 genérico (inalterado).

## Testes (TDD)

- **`col()`**: lança `FieldUnavailableError` quando o campo é `null`-mapeado; retorna a
  coluna mapeada quando há mapping; retorna o canônico quando não há schema/mapping
  (OM/sem-schema seguem verdes).
- **Route**: ação cujo campo requerido está `null`-mapeado ⇒ 422 com o nome do campo;
  ação normal ⇒ 200. (Mock do client doc com `schema` contendo um `null`.)

## Não-objetivos — o track de "matar o legado" (fora desta spec)

A eliminação completa do `/api/bigquery` — migrar as páginas fixas para a camada
semântica — é grande demais para uma spec e é onde o "nada legado" se realiza de fato.
Esboço do track (cada item = spec/plano próprio):
- **G9-B:** endpoint semântico *bulk* (resolver N métricas de uma página numa chamada;
  hoje `/api/metrics/[id]/data` é 1-a-1).
- **G9-C…N:** migrar página-a-página (ou por grupo) para o bulk, lendo `schemaBindings`.
- **G9-final:** remover `/api/bigquery`, `queries.ts`, `schema-resolver.ts`,
  `ClientSchema`/`client.schema`/`client.dataset`.

O G9 desta rodada apenas garante que, até essa migração, o legado **falha em vez de
mentir**.
