# Regras de Governança

Regras imperativas sobre como decisões técnicas são tomadas, registradas, aprovadas e revisadas no projeto. Governança aqui significa **quem decide, com que rigor, com que rastro e com que reversibilidade** — não cobre estilo de código (ver @rules/development), segurança operacional (ver @rules/security), observabilidade (ver @rules/observability) ou formato de release (ver Processes/release).

Toda regra abaixo é enforce: vira gate de PR, item de checklist obrigatório ou processo formal de exceção. Não há regra "soft".

---

## Decisões arquiteturais (ADRs)

- **Sempre** registre como ADR qualquer decisão que: (a) tenha alternativa legítima, (b) tenha consequência de longo prazo, (c) seja custosa de reverter, (d) afete múltiplos times ou consumidores externos.
- **Nunca** tome decisão que se encaixe nos critérios acima fora de ADR. Mesmo que já tenha sido "conversada" em chat ou call.
- **Sempre** crie o ADR **antes** do PR de implementação. PR que implementa decisão sem ADR aprovado é bloqueado.
- **Nunca** edite o conteúdo histórico de um ADR `accepted`. Mudou de ideia? Crie novo ADR com status `supersedes 000X` e marque o anterior como `superseded`.
- **Sempre** numere ADRs sequencialmente com prefixo de 4 dígitos (`0001-`, `0002-`). Não pule números.
- **Nunca** abra ADR para decisão trivial (escolha de nome de variável, formatação, biblioteca utilitária sem tradeoff). Overhead documental aqui é ruído.
- **Sempre** documente o **rejeitado e por quê**, não apenas o escolhido. ADR sem alternativas consideradas é incompleto.
- Formato e template canônico vivem em @rules/documentation e na pasta `decisions/`.

---

## Code ownership e áreas críticas

- **Sempre** mantenha `CODEOWNERS` (ou equivalente) cobrindo: schema do banco, módulos de autenticação, módulos de billing, integrações de pagamento, prompts e configuração de modelos de IA, infraestrutura como código, pipelines de CI.
- **Nunca** faça merge em área crítica sem aprovação do owner declarado. Aprovação de qualquer revisor não substitui aprovação do owner.
- **Sempre** declare pelo menos **dois owners** por área crítica. Owner único é ponto de falha.
- **Nunca** atribua ownership a indivíduo que não esteja ativamente trabalhando no código. Ownership é responsabilidade, não troféu histórico.
- **Sempre** revise `CODEOWNERS` trimestralmente. Owner que saiu do time deve ser removido na semana seguinte.

---

## Mudanças sensíveis (gates de aprovação)

Toda mudança em uma das categorias abaixo exige aprovação adicional documentada no PR:

- **Schema de banco** (DDL, migrações, índices em coleção populada): aprovação de owner de dados + plano de rollback no corpo do PR.
- **Autenticação e autorização** (claims, roles, permissões, fluxos de login): aprovação de owner de segurança + nota de impacto em sessões ativas.
- **Billing** (preços, cobrança, integração com gateway, contadores de uso): aprovação de owner de billing + cenário de teste documentado.
- **Compliance** (tratamento de PII, retenção, exportação, deleção): aprovação de owner de compliance + referência à base legal.
- **Prompts de produção** e configuração de modelos: aprovação de owner de IA + evidência de eval aprovado (ver seção IA generativa).
- **Feature flags de alto impacto** (kill-switch, rollout cross-tenant): aprovação de owner do domínio afetado.

**Nunca** consolide múltiplas mudanças sensíveis no mesmo PR. Um gate por PR.

---

## Classificação de dados

- **Sempre** classifique todo campo persistido em uma das quatro categorias: `public`, `internal`, `sensitive`, `pii`. A classificação fica no schema, não em documentação paralela.
- **Nunca** logue campo `pii` ou `sensitive` em texto plano. Mascare, hashe ou omita. Ver @rules/observability e @rules/security para detalhes de redação.
- **Sempre** criptografe `pii` e `sensitive` em repouso quando o provedor não fizer automaticamente.
- **Nunca** envie dados `pii` ou `sensitive` para terceiros (incluindo provedores de LLM) sem DPA assinado e flag explícita no código indicando o consentimento ou base legal.
- **Sempre** documente fluxo de dados `pii` ponta a ponta: origem, destinos, transformações, retenção. Sem mapa, não há tratamento.

---

## Retenção e deleção (LGPD/GDPR)

- **Sempre** defina prazo de retenção explícito para cada coleção ou tabela que armazene `pii`. Default de retenção indefinida é proibido.
- **Sempre** implemente endpoint ou job de **deleção por titular** (right to erasure) antes de coletar `pii` em uma nova feature. Não há "implementaremos depois".
- **Nunca** faça soft delete de `pii` sem definir prazo para hard delete. Soft delete eterno é retenção disfarçada.
- **Sempre** estenda deleção a backups, caches, índices de busca, logs estruturados e exports analíticos. Deletar apenas do banco primário é deleção parcial.
- **Sempre** mantenha registro de operações de deleção por titular (quem pediu, quando, o que foi deletado). Sem audit log, não há prova de compliance.
- **Nunca** treine modelos próprios ou de terceiros com `pii` sem base legal documentada e opt-out funcional.

---

## Licensing de dependências

- **Sempre** verifique a licença antes de adicionar dependência. PR que adiciona dependência sem nota de licença no corpo é bloqueado.
- **Nunca** introduza dependência com licença `AGPL`, `GPL` (qualquer versão), `SSPL`, `BUSL`, `Commons Clause` ou licenças "source-available" sem aprovação explícita de owner legal.
- **Sempre** prefira `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `0BSD`. Essas são allowlist padrão.
- **Sempre** trate licenças `LGPL` e `MPL-2.0` como caso a caso. Aceitas para uso isolado, vetadas para fork ou modificação sem revisão.
- **Nunca** copie código de terceiros (Stack Overflow, gists, repositórios) para dentro do projeto sem identificar a licença de origem e preservar a atribuição.

---

## Avaliação de novas dependências

Antes de adicionar dependência nova, **sempre** avalie e registre no PR:

- **Manutenção:** último release, frequência de commits nos últimos 12 meses, número de maintainers ativos. Dependência abandonada (sem release há mais de 18 meses) é vetada salvo justificativa.
- **Segurança:** vulnerabilidades conhecidas (npm audit, advisory database), histórico de CVEs, política de disclosure.
- **Footprint:** tamanho bruto, transitive deps, impacto em bundle e cold start.
- **Substituibilidade:** existe alternativa nativa, na stdlib ou em dependência já existente? Se sim, justifique a adição.
- **Vendor lock-in:** dependência amarra o projeto a um único fornecedor de cloud, SaaS ou modelo de IA? Se sim, documente a estratégia de saída.

**Nunca** adicione dependência apenas para evitar escrever 20 linhas de código. Custo total inclui auditoria recorrente, upgrade, breaking changes e remoção.

---

## Supply chain

- **Sempre** commite o lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`). Lockfile fora do repositório é proibido.
- **Nunca** use `npm install --no-package-lock` ou equivalente em CI. Instalações em CI usam install determinístico (`npm ci`, `pnpm install --frozen-lockfile`).
- **Sempre** rode auditoria de vulnerabilidades em CI. PR que introduz vulnerabilidade `high` ou `critical` é bloqueado até mitigação documentada.
- **Sempre** gere SBOM (Software Bill of Materials) por release. SBOM não-gerado é dívida de compliance.
- **Nunca** instale dependência via URL git, tarball arbitrário ou fork não-oficial sem aprovação. Origens fora do registry público exigem justificativa.
- **Sempre** habilite verificação de integridade (`integrity` no lockfile). Subresource integrity é não-negociável.

---

## Terceirização de chamadas de IA

- **Sempre** desabilite explicitamente "treinamento com dados do usuário" em todo provedor de LLM utilizado. Opt-out implícito não conta — exige flag visível no código ou config do provedor.
- **Nunca** envie dados `pii` ou `sensitive` a provedor de LLM sem DPA assinado e referência à base legal no PR que ativa o fluxo.
- **Sempre** fixe região (region pinning) quando o provedor suportar. Default global é proibido para fluxos que tocam `pii`.
- **Nunca** envie segredos, tokens, chaves ou conteúdo de variáveis de ambiente para LLM sob nenhuma circunstância — incluindo prompts de debug.
- **Sempre** registre, por chamada, o provedor, modelo, versão e fingerprint do prompt. Sem rastro, não há auditoria nem reprodução.
- **Sempre** mantenha lista de provedores aprovados e suas finalidades. Novo provedor exige ADR.

---

## Governança de IA generativa

- **Sempre** rode eval obrigatório antes de mudar prompt de produção. PR que altera prompt sem evidência de eval aprovado é bloqueado.
- **Nunca** faça deploy de mudança em prompt de produção fora de janela em que o owner de IA esteja disponível para reverter.
- **Sempre** mantenha **human-in-the-loop** em decisões de IA com impacto financeiro, jurídico, médico ou irreversível. Autonomia total é proibida nessas classes.
- **Sempre** marque conteúdo gerado por IA com identificador visível ao usuário final quando o conteúdo for público ou compartilhável.
- **Sempre** versione prompts como código. Prompt em string solta no meio de feature é dívida — extraia para módulo dedicado e versione.
- **Nunca** confie em saída de LLM como autoridade para decisão de segurança, autorização ou validação de input. LLM informa, não autoriza.
- **Sempre** documente vieses conhecidos do modelo e mitigações aplicadas para casos de uso que envolvam pessoas (avaliação, ranking, moderação).
- **Sempre** mantenha kill-switch funcional por feature de IA. Feature de IA sem kill-switch não vai para produção.

---

## Feature flags como instrumento de governança

- **Sempre** registre, para cada flag: dono, motivo, data de criação, data de expiração planejada e critério de remoção.
- **Nunca** crie flag sem dono. Flag órfã é dívida que ninguém remove.
- **Sempre** defina data de expiração. Flag permanente é configuração e deve virar config, não flag.
- **Sempre** revise mensalmente flags expiradas. Flag vencida há mais de 30 dias entra em fila de remoção compulsória.
- **Sempre** mantenha kill-switch separado de flag de rollout. Misturar os dois transforma incidente em refactor.
- **Nunca** use flag para esconder feature sem documentação. Flag ativa em produção é feature em produção.

---

## Acesso a produção

- **Sempre** aplique least privilege. Acesso default a produção é nenhum.
- **Sempre** trate acesso emergencial como **break-glass**: requer justificativa, é audit-logado, é temporário e dispara revisão pós-uso.
- **Nunca** use credenciais compartilhadas (conta única para múltiplas pessoas) para produção. Acesso é nominal.
- **Sempre** revise lista de pessoas com acesso a produção trimestralmente. Quem saiu do time perde acesso na semana de desligamento, não no trimestre seguinte.
- **Nunca** dê acesso a produção sem que a pessoa tenha completado treinamento de incident response e assinado política de uso.

---

## Gestão de segredos

- **Sempre** rotacione segredos em prazo definido por classe: tokens longa duração a cada 90 dias, chaves de assinatura a cada 180 dias, credenciais de banco a cada 90 dias. Segredo sem rotação é vulnerabilidade.
- **Nunca** reuse segredo entre ambientes (dev, staging, prod). Reuso elimina a barreira de blast radius.
- **Sempre** escope segredo ao menor conjunto de operações necessário. Chave admin em código de leitura é violação.
- **Nunca** comite segredo, mesmo em commit que será revertido. História do git preserva — rotação imediata é obrigatória se houver vazamento.
- Convenções de naming, armazenamento e ciclo de vida de secrets vivem em Contracts/secrets.

---

## Revisão periódica (drift)

- **Sempre** revise ADRs `accepted` semestralmente. ADR cuja premissa não vale mais entra em fila para supersedir.
- **Sempre** revise contratos públicos (APIs, eventos, schemas) trimestralmente para detectar drift entre documentado e implementado.
- **Nunca** trate revisão periódica como opcional. Falta de revisão é como falta de release: dívida silenciosa que acumula.
- **Sempre** designe responsável nomeado por cada revisão. "O time revisa" significa "ninguém revisa".

---

## Processo de exceção

- **Sempre** que uma regra desta governança precisar ser quebrada, registre **exceção formal** contendo: regra quebrada, motivo, escopo (qual PR, qual módulo, qual janela temporal), validade, aprovador.
- **Nunca** aplique exceção retroativamente para legitimar regra já quebrada sem registro. Exceção tem que ser **prévia**.
- **Sempre** defina prazo de validade da exceção. Exceção "permanente" é mudança de regra — abra ADR para alterar a regra.
- **Sempre** revise exceções abertas mensalmente. Exceção expirada é violação ativa.

---

## Responsabilização (oncall e RACI leve)

- **Sempre** mantenha rotação de oncall com escala publicada. Oncall sem escala é oncall fantasma.
- **Sempre** defina, para cada domínio crítico, quem é **Responsible**, **Accountable**, **Consulted** e **Informed**. RACI completo é overhead; RACI ausente é caos.
- **Nunca** sobreponha Responsible e Accountable na mesma pessoa para sistemas com múltiplos contribuidores. Quem executa não pode ser quem aprova a si mesmo.
- **Sempre** documente runbook mínimo por domínio crítico antes de ele entrar em produção. Sistema em produção sem runbook é dívida de oncall.

---

## Comunicação de mudanças externas

- **Sempre** anuncie com antecedência mínima de 30 dias qualquer mudança breaking em API, evento, webhook ou contrato exposto a consumidor externo. Quebra surpresa é violação.
- **Nunca** remova endpoint público sem período de deprecação documentado e header de aviso na resposta.
- **Sempre** mantenha changelog público para superfícies externas. Mudança não-anunciada não existe do ponto de vista do integrador.
- **Sempre** versione contratos públicos. Mudança que altera semântica sem mudar versão é quebra disfarçada.

---

## Compliance (mapeamento mínimo)

- **Sempre** mantenha mapeamento "dado pessoal → base legal" atualizado. Coletar `pii` sem base legal declarada é violação direta de LGPD/GDPR.
- **Nunca** colete dado pessoal "porque pode ser útil depois". Coleta exige finalidade declarada.
- **Sempre** mantenha registro de operações de tratamento (ROPA) acessível. Auditoria sem ROPA é auditoria reprovada.
- **Sempre** trate **transferência internacional** de `pii` como evento que exige aprovação de owner de compliance. Movimentar dado entre regiões não é detalhe técnico.

---

## Anti-patterns

Cada um dos itens abaixo é **bloqueio** de PR ou **incidente de governança** quando detectado em produção:

- Decisão crítica implementada sem ADR.
- ADR `accepted` editado em vez de superseded.
- Dependência adicionada em PR sem nota de licença, manutenção ou justificativa.
- Segredo sem rotação configurada.
- Prompt de produção alterado sem evidência de eval.
- Feature flag sem dono, sem expiração ou sem kill-switch.
- Acesso a produção concedido fora do fluxo nominal.
- Dado `pii` enviado a terceiro sem DPA e sem opt-out de treinamento.
- Soft delete de `pii` sem prazo de hard delete.
- Mudança breaking em API pública sem janela de deprecação.
- Exceção a regra aplicada retroativamente para legitimar violação prévia.
- Dependência com licença vetada (`AGPL`, `GPL`, `SSPL`, etc.) introduzida sem aprovação legal.
- LLM utilizado como autoridade final em decisão de segurança ou autorização.

---

## Referências cruzadas

- @rules/security — regras de segurança operacional (auth, criptografia, validação de input).
- @rules/observability — redação de PII em logs, audit log estruturado.
- @rules/documentation — formato MADR de ADRs, template e versionamento.
- @rules/code-review — gates de revisão e aprovações.
- @rules/validation — validação de input que protege fronteiras com terceiros.
- Pasta `decisions/` — ADRs vigentes do projeto.
- Contracts/secrets — convenções de naming e ciclo de vida de segredos.
- Processes/release — janelas de release e processo de deploy.
- Stacks/Harness Engineering — ferramentas que apoiam parte desta governança.
