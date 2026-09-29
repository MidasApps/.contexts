---
title: Glossário do Domínio
type: business
scope: glossary
status: active
last_updated: 2026-09-29
related:
  - "@business/vision"
---

# Glossário do Domínio

Ubiquitous language do projeto: todo termo de domínio usado em código, UI e docs
deve constar aqui com UMA definição. Nomes de entidades/agregados derivam desta tabela.

## Termos do core

Termos genéricos do core agêntico, válidos para toda aplicação derivada. Modelo de
acesso: `@.contexts/engineering/decisions/0010-tenancy-organization-project-units-and-rbac.md`
e `@.contexts/engineering/rules/tenancy.md`. O identificador em código aparece entre
crases quando difere do termo.

| Termo | Definição | Sinônimos proibidos |
|---|---|---|
| Organização | O tenant: fronteira de isolamento de dados e de cobrança. Raiz da árvore de nós. Em código e dados, o ID é `tenantId`. | empresa, conta, workspace, cliente, tenant (na UI) |
| Projeto | Nó filho de uma Organização que agrupa trabalho e dados dentro dela. | espaço, pasta, board |
| Unidade | Nó opcional abaixo de um Projeto, com tipo (`unitType`) definido pela aplicação; forma uma árvore via `parentId`. | setor, departamento, filial, grupo (como termo genérico) |
| Nó | Qualquer ponto da árvore de acesso: Organização, Projeto ou Unidade. Grants são dados por nó e herdados para baixo. | escopo, nível, container |
| Membro | Principal `user` com pelo menos um grant ativo numa Organização (documento em `memberships`). | participante, colaborador, associado |
| Papel | Conjunto nomeado de Permissões atribuído a um Membro num Nó. De sistema (`owner`, `admin`, `member`, `viewer`) ou custom do tenant. | perfil, cargo, grupo de acesso |
| Permissão | Direito atômico no formato `<module>.<resource>.<action>` (ex.: `core.members.invite`), declarado no manifesto do Módulo. | privilégio, direito, scope (em UI) |
| Principal | Quem age num request: `user`, `device`, `service` ou `platform staff`. É sempre derivado da credencial autenticada. | ator (em código), requester, caller |
| Dispositivo | Principal `device`: aparelho ativado por código de uso único, com escopo de um Nó. | terminal, máquina, client |
| Chave de API | Credencial do principal `service` (integrações e clientes MCP), com escopo de um Nó e lista explícita de Permissões. Guardada só como hash. | token de integração, secret key, app key |
| Staff da plataforma | Principal `platform staff`: opera o `/admin`, sem acesso a dados de tenant fora de impersonação auditada. | superadmin, root, suporte (como papel) |
| Aprovação | Pedido gerado por uma Permissão `requiresApproval`, decidido por outro principal com a mesma Permissão no Nó. | autorização (para este fluxo), validação, sign-off |
| Módulo | Pacote de extensão declarado por `defineModule()` que contribui Permissões, contratos, tools, skills e telas. O core nunca importa um Módulo específico. | plugin, add-on, extensão, app |
| Agente | Agente Mastra com `instructions` versionadas, cap de steps e teto de Permissões (interseção com as do usuário). | bot, assistente (em código), IA |
| Tool | Função chamável por um Agente, com input Zod estrito; de leitura ou de mutação (mutação exige aprovação). | ação, comando, function (em docs) |
| Skill | Pacote de instruções `SKILL.md` que um Agente carrega sob demanda. | prompt, receita, playbook |
| Conector | Integração configurada por tenant que expõe uma fonte externa ao Agente (banco somente leitura, API HTTP, servidor MCP). | integração (como entidade), datasource, adapter (na UI) |
| Thread | Conversa persistida entre um usuário e Agentes, com `resourceId = tenantId:uid`. | sessão, conversa (em código), chat (para uma conversa; "chat" é a superfície) |
| Knowledge base | Conjunto de documentos ingeridos e indexados em pgvector, com namespace por tenant e projeto, consultado com citação obrigatória. | base de conhecimento (em código), corpus, índice, memória |

## Termos de negócio da aplicação

> **Ainda não preenchido.** Termos do domínio da aplicação derivada entram numa tabela
> aqui. Enquanto vazio, não assuma significado de termos de domínio: pergunte ou
> declare indefinição.

| Termo | Definição | Sinônimos proibidos |
|---|---|---|
| <!-- PREENCHER --> | | |

## Regras de uso
- Um conceito = um termo. Sinônimos proibidos ficam registrados para evitar drift.
- Termo novo em feature nova → adicionar aqui ANTES de nomear código/schema.
