# Pull Requests

Convenção operacional do ciclo de vida de Pull Requests no repositório. Governa estrutura, revisão, automação e merge. Para regras de conduta de revisão, ver `@rules/code-review`. Para fluxo de branches e merge strategy, ver `@processes/git`. Para mensagens de commit, ver `@processes/commits`. Para gates automatizados, ver `@processes/deploy`.

---

## Filosofia

O Pull Request é a unidade de proposta de mudança no repositório. Cada PR representa uma intenção atômica, revisável e auditável.

- **Pequeno + focado + completo** supera **grande e incompleto**.
- Um PR carrega o código, os testes que o validam e a documentação que o explica.
- Um PR não é veículo de "lote de mudanças" — é veículo de **uma** mudança coerente.
- O título e a descrição do PR são parte do contrato: serão lidos por humanos, LLMs e futuros mantenedores.

---

## Tamanho ideal

- **Alvo:** menos de 400 linhas de mudança real (excluindo lock files, snapshots gerados, fixtures auto-geradas).
- **Limite duro de atenção:** acima de 800 LOC reais, dividir obrigatoriamente em PRs incrementais ou stacked.
- **Exceções legítimas:** refactors automatizados (renames em massa via codemod), migrations de schema verificáveis mecanicamente, regenerações de tipos. Sempre sinalizar no título: `chore(refactor): rename X to Y (codemod)`.
- Quando em dúvida entre 1 PR grande ou N PRs pequenos, escolher N pequenos.

---

## Ciclo de vida

1. Branch criada a partir de `main` atualizada — ver `@processes/git`.
2. Commits seguem Conventional Commits — ver `@processes/commits`.
3. PR aberto. Enquanto WIP, marcar como **Draft**.
4. CI roda automaticamente — ver `@processes/deploy`.
5. **Self-review** do autor: revisar o próprio diff no GitHub antes de marcar como ready for review.
6. Reviewers atribuídos (manualmente ou via CODEOWNERS).
7. Comentários, threads e iteração.
8. **Approvals**: mínimo 1 (mais para áreas críticas — ver seção Reviewers).
9. Merge — squash por padrão, ver `@processes/git`.
10. Branch deletada automaticamente pós-merge.

---

## Título do PR

- Usar formato **Conventional Commits**: `type(scope): description`.
- Será reutilizado como mensagem do squash commit em `main`.
- Imperativo, presente, lowercase após o prefixo, sem ponto final.
- Ver `@processes/commits` para tipos e escopos válidos.

**Exemplos válidos:**
- `feat(auth): add passkey enrollment endpoint`
- `fix(billing): handle stripe webhook race on subscription cancel`
- `chore(deps): bump zod to 3.23.8`

**Inválidos:**
- `WIP` — abrir como Draft em vez disso
- `update stuff`
- `Fix bug.`

---

## Template de descrição

Arquivo: `.github/pull_request_template.md`.

```markdown
## Summary
<1-3 bullets do que muda e por quê>

## Changes
- <change 1>
- <change 2>

## Why
<contexto e motivação não-óbvios>

## How to test
- [ ] Step 1
- [ ] Step 2

## Screenshots / Recordings
<UI changes>

## Risks
<breaking changes, rollback plan, migrations>

## Checklist
- [ ] Tests adicionados/atualizados
- [ ] Docs atualizadas
- [ ] Migrations idempotentes e reversíveis quando viável
- [ ] Sem secrets commitados
- [ ] Feature flag quando aplicável
```

Seções vazias devem ser removidas, não deixadas com placeholder.

---

## Labels

Aplicar pelo menos uma label de cada categoria aplicável:

- **Tipo:** `type:feat`, `type:fix`, `type:chore`, `type:refactor`, `type:docs`, `type:test`, `type:perf`.
- **Área:** `area:auth`, `area:billing`, `area:ai`, `area:infra`, `area:ui`, `area:api`.
- **Prioridade:** `priority:low`, `priority:medium`, `priority:high`, `priority:critical`.
- **Estado:** `needs-review`, `needs-changes`, `blocked`, `ready-to-merge`.
- **Especiais:** `dependencies`, `release-notes`, `breaking-change`, `security`.

Labels podem ser auto-aplicadas via automação a partir do título Conventional ou de paths tocados.

---

## Reviewers

- **CODEOWNERS** (`.github/CODEOWNERS`) atribui reviewers automaticamente por path — ver `@rules/governance`.
- **1 approval** obrigatória para a maioria das mudanças.
- **2 approvals** obrigatórias para áreas críticas: autenticação, billing, migrations de schema, prompts de IA, infraestrutura de produção.
- Em mudanças cross-domain, atribuir **domain expert + tech expert** quando possível.
- O autor **nunca aprova o próprio PR**.

---

## Draft PRs

- Usar quando o trabalho está em progresso mas se deseja feedback early, validar abordagem ou compartilhar visibilidade.
- Drafts **não notificam reviewers** e **não bloqueiam o board** de review.
- Promover para "Ready for review" somente após self-review e CI verde.
- Drafts abandonados por mais de 14 dias devem ser fechados ou retomados.

---

## Stacked PRs

Para features grandes que excedem o tamanho ideal:

- Dividir em PRs encadeados: `base-pr` → `feature-step-1` → `feature-step-2` → `feature-step-3`.
- Cada PR depende do anterior; merge respeita a ordem.
- Após cada merge, **rebase downstream** dos PRs subsequentes sobre `main`.
- Indicar dependência explicitamente na descrição: `Depends on #123`.
- Ferramentas suportadas: **Graphite**, **ghstack**.

---

## CI gates

O merge só é permitido com todos os checks verdes. Ver `@processes/deploy` para detalhes. Checks obrigatórios:

- Lint + format
- Typecheck
- Tests (unit + integration)
- E2E nas áreas tocadas
- Build successful
- Security scan (gitleaks, dependabot, CodeQL)
- Coverage não regride significativamente (threshold definido por área)
- Bundle size check (em projetos Next.js)
- Preview deploy bem-sucedido (Vercel / Firebase Hosting)

Bypass de CI gates só com aprovação explícita documentada no PR — ver seção Hotfix.

---

## Auto-merge

- Habilitar **GitHub auto-merge** após o PR ter approvals suficientes e estar aguardando apenas CI.
- Auto-merge aciona squash assim que o último check passa.
- Cancelar auto-merge se novos commits forem pushados — exige nova aprovação.

---

## Resolução de conflitos

- **Rebase local** sobre `main` atualizada, nunca merge commit no PR.
- Resolver conflitos localmente, validar testes, então `git push --force-with-lease`.
- Nunca usar `--force` sem `--with-lease` — risco de sobrescrever trabalho de outros que pushed na branch.
- Após force-push em PR com approvals existentes, **comunicar nos comments** e solicitar re-review.

---

## Comments e revisões

Ver `@rules/code-review` para taxonomia obrigatória de comentários (`blocker:`, `issue:`, `suggestion:`, `nit:`, `question:`, `praise:`).

- O **autor resolve threads** quando endereçados.
- O **reviewer fecha threads** quando satisfeito com a resposta ou mudança.
- Após mudanças significativas em resposta a review, solicitar **re-review** explicitamente.
- Discussões longas (>5 idas-e-vindas) devem migrar para chamada síncrona; decisão final volta como comment de resolução.

---

## SLA

- **Time to first review:** menos de 24 horas úteis após PR marcado ready.
- **Resposta do autor a comments:** menos de 24 horas úteis.
- **Idade máxima sem atualização:** 7 dias. PR estagnado deve ser escalado, retomado ou fechado.
- **Aging board** é monitorado semanalmente; PRs com idade > SLA são triados.

---

## Métricas observadas

- **PR cycle time** (abertura → merge)
- **Time to first review**
- **PR size distribution** (LOC por PR)
- **Approval rate** (PRs aprovados vs. fechados sem merge)
- **Review depth** (comments por 100 LOC)
- **Rework rate** (commits após primeira aprovação)

Métricas são para diagnóstico de processo, não para avaliação individual.

---

## PRs especiais

### Dependency bumps

- **Auto-merged** por Dependabot/Renovate quando: patch version, sem breaking changes anunciadas, tests verdes.
- **Minor** version: review humano de 1 reviewer.
- **Major** version: review completo + verificação de breaking changes + smoke test manual.
- Lockfile-only PRs não contam para tamanho.

### Migrations de schema

Ver `@rules/migration`.

- **2 approvals obrigatórias.**
- Runbook anexado na descrição.
- Ordem de deploy documentada (forward/backward compatibility).
- Plano de rollback explícito.

### Prompts de IA

Ver `@rules/governance`.

- **Eval suite** rodada antes de merge.
- Comparativo before/after anexado (métricas, exemplos, regressões).
- Review por domain expert do produto + engenheiro de IA.

### Hotfix

- Pode pular gates específicos (E2E lento, coverage threshold) com **aprovação explícita** documentada no PR.
- Label `hotfix` obrigatória.
- **Postmortem** abrindo no próximo dia útil.
- Backport para branches de release ativas — ver `@processes/release`.

---

## PRs assistidos por IA

PRs gerados ou substancialmente assistidos por Claude Code, Copilot ou outras ferramentas de IA seguem regras adicionais:

- Sinalizar autoria via trailer `Co-Authored-By:` no commit.
- **Mesmo rigor de review** que código humano — ver `@rules/code-review`.
- O **autor humano é o responsável final** pelo conteúdo, semântica e segurança do PR.
- Não aceitar sugestões de IA sem entender o que fazem, especialmente em código que toca secrets (`@contracts/secrets`), auth ou billing.

---

## Estratégia de merge

- **Squash** (padrão): 1 commit por PR em `main`, mensagem = título do PR.
- **Merge commit**: raramente, apenas em release branches ou quando histórico granular é critico para auditoria.
- **Rebase merge**: quase nunca — perde a unidade lógica do PR.

Configuração default no repositório: squash habilitado, merge commit e rebase desabilitados ou restritos.

---

## Deleção de branch

- **Automática pós-merge** via repo settings.
- Branches stale (sem PR, sem commits há >30 dias) são limpas em sweep mensal.
- Branches protegidas (`main`, `release/*`) nunca são deletadas automaticamente.

---

## Anti-patterns

- PRs gigantes ("review nightmare") — divida.
- PR sem description ou com template vazio com placeholders intactos.
- Misturar refactor + feature + bug fix em um único PR.
- Bypass de CI rotulado como "urgent" sem justificativa documentada.
- Approval sem realmente revisar ("LGTM em 30 segundos").
- Mergear próprio PR sem approval.
- Merge com testes vermelhos ou pulando checks sem aprovação explícita.
- Force-push em PR após approvals sem comunicar nos comments.
- Branches stale acumulando no repositório.
- PR sem reviewer atribuído por dias.
- Esquecer feature flag em mudança que afeta produção sem rollout gradual.
- Testes escritos "no próximo PR" — ver `@rules/testing`, devem vir junto.
- Sem screenshots ou recording em PR de UI.
- Resolver threads de reviewer sem responder ao ponto levantado.
- Reabrir discussão já decidida em PR anterior sem trazer novo contexto.

---

## Referências cruzadas

- `@processes/git` — branches, merge strategy, conventions de versionamento
- `@processes/commits` — formato Conventional Commits
- `@processes/deploy` — gates de CI, checks obrigatórios e ciclo de deploy pós-merge
- `@processes/release` — release branches, backport, versionamento de release
- `@rules/code-review` — conduta de review e taxonomia de comments
- `@rules/governance` — CODEOWNERS e governance de áreas críticas
- `@rules/migration` — regras para PRs de migration
- `@rules/testing` — disciplina de testes acompanhando mudanças
- `@contracts/secrets` — convenções de modelagem e proteção de secrets
