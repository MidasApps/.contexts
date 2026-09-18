---
title: Convenções de Commit
type: process
status: active
last_updated: 2026-05-20
standard: Conventional Commits 1.0.0
---

# Convenções de Commit

Toda mensagem de commit neste repositório segue **Conventional Commits 1.0.0**. O padrão é enforce via Commitlint local (Husky) e GitHub Action de validação de título de PR. Mensagens fora do padrão são rejeitadas no pre-commit hook ou no merge check.

Este processo governa apenas a forma e a disciplina da mensagem. Para fluxo de branches, ver `@processes/git`. Para ciclo de revisão e merge, ver `@processes/pull-requests`. Para geração de changelog e versionamento, ver `@processes/release`. Para integração com CI, ver `@processes/deploy`.

## Estrutura canônica

```
<type>(<scope>)<!>: <subject>

<body>

<footer>
```

- A primeira linha (header) é obrigatória.
- `body` e `footer` são opcionais, separados por linha em branco.
- O `!` antes do `:` sinaliza breaking change.

## Types canônicos

Use exatamente um dos types abaixo. Type novo não é permitido sem decisão registrada em `@decisions`.

| Type | Quando usar |
|---|---|
| `feat` | Nova feature visível ao usuário ou consumidor da API |
| `fix` | Bug fix em comportamento existente |
| `docs` | Documentação apenas — sem mudança de código executável |
| `style` | Formatação, whitespace, lint auto-fix — sem mudança de comportamento |
| `refactor` | Reescrita interna sem mudar comportamento observável e sem corrigir bug |
| `perf` | Mudança cuja motivação primária é performance |
| `test` | Adicionar ou corrigir testes (sem alterar código de produção) |
| `build` | Sistema de build, gerenciador de pacotes, dependências |
| `ci` | Configuração de CI/CD (workflows, jobs, runners) |
| `chore` | Tarefas operacionais que não se encaixam nas categorias acima |
| `revert` | Reverte um commit anterior (corpo cita o SHA revertido) |

## Scope

Scope é opcional e identifica a área impactada. Quando a área é clara, scope é obrigatório por convenção do time.

- Use **kebab-case**.
- Prefira nomes de bounded contexts (`orders`, `billing`, `auth`, `inventory`) ou áreas técnicas estáveis (`deps`, `ci`, `release`).
- Não use scopes genéricos como `app`, `core`, `misc`.
- Não use scopes hierárquicos com `/` — um nível só.

Exemplos válidos:

```
feat(orders): ...
fix(auth): ...
chore(deps): ...
ci(release): ...
```

## Subject

O subject é a parte humana da mensagem. Regras absolutas:

- **Imperativo presente**: "add", "fix", "update", "remove", "rename".
- **Nunca** passado ("added", "fixed") nem terceira pessoa ("adds", "fixes").
- **Sem ponto final**.
- **Minúscula inicial** (consistência com nomes técnicos no meio da frase).
- **≤72 caracteres** contando type, scope, `!` e `:`.
- Não duplique o scope no subject (`feat(auth): auth login bug` — errado).

## Body

Body é separado do header por linha em branco e explica o **porquê**.

- O diff já mostra **o quê**; o body existe para registrar motivação, contexto, tradeoffs considerados.
- Wrap em **72-100 caracteres** por linha.
- Múltiplos parágrafos são permitidos; use linha em branco entre eles.
- Listas com `-` são permitidas quando enumeram causas, efeitos ou itens não-óbvios.
- Para mudanças não-óbvias, body é obrigatório. Ver `@rules/documentation` sobre densidade de prosa.

## Breaking changes

Toda quebra de contrato (API pública, schema persistido, comportamento observável de consumidor externo) **deve** ser sinalizada.

Duas formas, ambas aceitas (preferir a primeira):

**Forma curta**, com `!` antes do `:`:

```
feat(api)!: remove deprecated user.fullName field
```

**Forma longa**, com footer dedicado:

```
feat(api): consolidate user name into single field

BREAKING CHANGE: user.fullName foi removido. Consumidores devem
concatenar firstName e lastName explicitamente.
```

Quando ambas são úteis (sinalização rápida no header + descrição detalhada no footer), use as duas juntas.

## Footer

O footer registra metadados estruturados. Cada entrada em sua própria linha.

| Footer | Uso |
|---|---|
| `Refs: #123` | Referência informativa a issue/PR |
| `Fixes: #123` | Fecha issue automaticamente ao merge |
| `Closes: #123` | Idem `Fixes:`, semântica equivalente |
| `BREAKING CHANGE: <desc>` | Descreve quebra (ver acima) |
| `Co-Authored-By: Name <email>` | Co-autoria humana ou assistida |
| `Reviewed-By: Name <email>` | Revisão formal registrada |
| `Signed-off-by: Name <email>` | DCO sign-off quando o repositório exige |

## Exemplos válidos

```
feat(orders): add idempotency key to checkout
```

```
fix(auth): redirect loop on expired session

Sessão expirada retornava 302 para /login que por sua vez relia
o cookie ainda inválido e redirecionava de novo. Agora o middleware
limpa o cookie antes do redirect.

Fixes: #482
```

```
refactor(billing)!: rename amount to amount_cents

BREAKING CHANGE: todos os campos monetários agora são inteiros em
centavos. Consumidores devem dividir por 100 ao exibir.
```

```
chore(deps): bump next from 14.2.0 to 15.0.0
```

```
docs(rules): add error-handling boundaries section
```

## Commits atômicos

Cada commit captura **um propósito**.

- Um commit não mistura refactor com feature nova: faça `refactor:` primeiro, depois `feat:`.
- Cada commit, isoladamente, deve **buildar e passar testes** — isso é verificado por `@processes/deploy` em estratégias que rodam por commit (bisect-friendly).
- Renomeações grandes vão sozinhas, sem mudança de comportamento junto.
- Mudanças de formatação em massa (`style:`) vão em commit próprio, separado de qualquer outra mudança.

## Squash policy

Esta política se conjuga com `@processes/git` e `@processes/pull-requests`.

- **Squash merge** é o default para features curtas — o resultado é **um commit final** na branch principal.
- Commits intermediários da branch da feature podem ser informais (`wip`, `fix lint`, `address review`) **se e somente se** serão squashed.
- O **título do PR deve seguir Conventional Commits**, pois é usado como mensagem do squash commit.
- O **corpo do PR** é usado como corpo do squash commit — escreva-o com o cuidado de uma mensagem de commit, não como rascunho.
- Branches de longa duração (ex.: release branches) **não usam squash**; commits são preservados e devem ser bem formados desde a origem.

Ver `@rules/code-review` para o que deve aparecer no corpo do PR antes do squash.

## Tooling

| Ferramenta | Papel |
|---|---|
| **Commitlint** + `@commitlint/config-conventional` | Validação local da mensagem no `commit-msg` hook |
| **Husky** | Instala o hook automaticamente em `pnpm install` |
| **Commitizen** (opcional) | Wizard guiado via `pnpm commit` para quem prefere |
| **`amannn/action-semantic-pull-request`** | GitHub Action que valida o título do PR contra Conventional Commits |

Configuração canônica em `commitlint.config.js`:

```js
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 72],
    'subject-case': [2, 'always', 'lower-case'],
    'subject-full-stop': [2, 'never', '.'],
  },
};
```

## Changelog automatizado

O changelog é gerado **a partir dos commits**, não escrito à mão. Os types alimentam diretamente o bump semântico:

| Commit | Bump SemVer |
|---|---|
| `fix:` | patch |
| `feat:` | minor |
| `feat!:` ou `BREAKING CHANGE:` | major |
| `docs:`, `style:`, `refactor:`, `test:`, `chore:`, `ci:`, `build:` | nenhum (não aparece no changelog público por padrão) |
| `perf:` | patch (visível no changelog) |

Ferramenta de release (Release Please, semantic-release ou changesets) é definida em `@processes/release`. A integridade do changelog **depende** da disciplina deste processo — uma quebra mascarada em `feat:` sem `!` produz um release minor que quebra consumidores.

## Co-authoring com AI

Quando uma mensagem é produzida com assistência de Claude Code ou agente equivalente, adicione no footer:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

A transparência sobre autoria humana versus assistida é exigida por `@rules/governance`. Não omita o co-author para "limpar" o histórico — o registro tem valor de auditoria.

## Anti-patterns

Os padrões abaixo são rejeitados em review ou bloqueados em CI:

- `fix stuff`, `update`, `WIP` chegando à main (sem squash que reescreva o título).
- Múltiplos propósitos no mesmo commit (feature + refactor + rename).
- `feat` sem scope quando a área é claramente identificável.
- Subject em passado (`fixed`, `added`) ou terceira pessoa (`fixes`, `adds`).
- Type errado: usar `fix` para feature nova, `feat` para bug fix, `chore` para mudança de comportamento.
- Body vazio em mudança não-óbvia (motivação implícita não conta).
- Header acima de 72 caracteres.
- Breaking change mascarada em `feat:` ou `fix:` sem `!` e sem footer `BREAKING CHANGE:`.
- Commits que não compilam ou não passam testes isoladamente.
- Renames combinados com refactor e feat no mesmo commit.
- Coexistência no mesmo repositório de commits Conventional e commits livres — o padrão é binário, não negociável por branch.
- PR mergeado via squash sem que o título do PR esteja formatado como Conventional Commit (gera commit final inválido na main).

## Referências cruzadas

- `@processes/git` — estratégia de branches, rebase, merge.
- `@processes/pull-requests` — ciclo de revisão, template, gates.
- `@processes/release` — versionamento semântico e changelog.
- `@processes/deploy` — validação automatizada de mensagens e build por commit.
- `@rules/documentation` — densidade e tom de prosa no body.
- `@rules/governance` — transparência de autoria humana versus assistida.
- `@rules/code-review` — o que registrar no corpo do PR antes do squash.
