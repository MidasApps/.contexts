---
title: Regras de Documentação
type: rules
status: active
last_updated: 2026-05-20
---

# Regras de Documentação

Regras imperativas sobre quando documentar, quando não documentar e como redigir documentação que sobrevive ao tempo. Aplicáveis a todo código, prosa e diagramas do repositório.

Este documento governa apenas o **quando e como** da documentação. Conteúdos específicos vivem em outras camadas: práticas de clean code em `@.contexts/engineering/practices/clean-code.md`, modelos arquiteturais em `@.contexts/engineering/architecture/`, decisões em `@.contexts/engineering/decisions/`, convenções de modelagem em `@.contexts/engineering/contracts/`.

---

## Princípio geral

**Código autoexplicativo vence comentário.** Antes de escrever um comentário ou doc, tente renomear, extrair função ou reestruturar.

- **Sempre** prefira nomes claros a comentários explicativos.
- **Sempre** extraia funções nomeadas em vez de comentar blocos de código.
- **Nunca** documente o que o código já diz literalmente.
- **Nunca** mantenha comentário que repete a assinatura da função.

---

## Quando documentar

- **Sempre** documente o **porquê** quando a decisão não for óbvia pelo código.
- **Sempre** documente **invariantes não-óbvias** (pré-condições, pós-condições, side effects).
- **Sempre** documente **workarounds** com link para a issue ou bug upstream.
- **Sempre** documente **APIs públicas** consumidas fora do módulo de origem.
- **Sempre** documente **fronteiras de sistema** (schemas, contratos de eventos, endpoints HTTP).
- **Sempre** documente **comportamento não-óbvio de terceiros** quando o time tropeçar nele.
- **Considere** documentar quando o próximo desenvolvedor for ler o código sem contexto compartilhado.

## Quando NÃO documentar

- **Nunca** comente o que o código faz literalmente.
- **Nunca** mantenha comentário desatualizado — apague ou atualize, nunca conviva.
- **Nunca** documente getters/setters triviais.
- **Nunca** documente funções privadas com nome autoexplicativo.
- **Nunca** crie README para pastas que apenas agrupam arquivos óbvios.
- **Nunca** duplique documentação upstream de bibliotecas — referencie a fonte oficial.
- **Nunca** documente roadmap futuro dentro do código — use issues ou ADRs.

---

## Comentários inline

- **Sempre** escreva comentários no presente, voz ativa.
- **Sempre** explique **why**, não **what**.
- **Sempre** prefixe workarounds com `// HACK:`, `// FIXME:` ou `// TODO:` com link para issue.
- **Sempre** apague código comentado — confie no git.
- **Nunca** use comentário para esconder lógica complexa que deveria ser refatorada.
- **Nunca** deixe `// TODO` sem dono e sem issue rastreável.
- **Nunca** use ASCII art ou banners decorativos em comentários.

### Exemplo certo

```ts
// Firestore não permite array-contains-any com mais de 10 valores;
// quebramos em chunks para evitar INVALID_ARGUMENT.
const chunks = chunk(ids, 10);
```

### Exemplo errado

```ts
// faz um chunk
const chunks = chunk(ids, 10);
```

---

## JSDoc / TSDoc

- **Sempre** use TSDoc em funções, classes e tipos **exportados** consumidos por outros módulos.
- **Sempre** documente parâmetros não-óbvios, retorno não-óbvio e exceções lançadas.
- **Sempre** inclua `@example` em utilitários genéricos reutilizados em múltiplos lugares.
- **Sempre** marque APIs instáveis com `@experimental` ou `@beta`.
- **Sempre** marque APIs em remoção com `@deprecated` e indique substituto.
- **Nunca** repita a assinatura TypeScript em prosa (`@param userId The user id` quando o nome já diz).
- **Nunca** use JSDoc em funções privadas ou de escopo de módulo.
- **Nunca** documente tipos derivados óbvios via `@returns` quando o tipo de retorno já é explícito.

### Exemplo certo

```ts
/**
 * Resolve o tenant ativo a partir do request, considerando override
 * via header `x-tenant-id` quando o caller for service account.
 *
 * @throws {TenantNotFoundError} quando o tenant resolvido não existe ou está suspenso.
 */
export function resolveTenant(req: Request): Tenant { ... }
```

---

## READMEs

- **Sempre** crie `README.md` na raiz de cada **pacote publicável** e **app executável**.
- **Sempre** estruture o README com: propósito, audiência, pré-requisitos, comandos para rodar, comandos para testar, links para documentação relacionada.
- **Sempre** mantenha o README **runnable** — todo comando listado deve funcionar copy-paste.
- **Sempre** referencie ADRs, regras e práticas relacionadas via `@` em vez de duplicar.
- **Nunca** use README como dump de notas pessoais.
- **Nunca** repita o conteúdo de `package.json` no README.
- **Nunca** crie README em pasta sem propósito coeso (`utils/`, `helpers/`).

### Escopo mínimo

```markdown
# Nome do pacote

Propósito em uma frase.

## Quando usar

## Como rodar

## Como testar

## Referências
- @.contexts/engineering/architecture/...
- @.contexts/engineering/decisions/...
```

---

## ADRs e decisões

- **Sempre** registre decisões técnicas com alternativas legítimas como ADR em `@.contexts/engineering/decisions/`.
- **Sempre** referencie o ADR a partir do código quando a decisão impactar a implementação local: `// see ADR NNNN-kebab-title em @.contexts/engineering/decisions/`.
- **Nunca** registre tradeoffs de decisão dentro de README ou comentário inline — extraia para ADR.
- **Nunca** edite ADRs aceitos para mudar a decisão — crie um novo ADR que supersede o anterior.

---

## Documentação de APIs públicas

- **Sempre** documente o contrato (request, response, erros, autenticação) em formato versionado (OpenAPI, GraphQL SDL, schema Zod exportado).
- **Sempre** mantenha a documentação **gerada a partir do código fonte** quando possível.
- **Sempre** versione a documentação junto com a API.
- **Nunca** mantenha documentação manual de API paralela ao schema — gere a partir do schema.
- **Nunca** publique API pública sem documentação consumível por cliente externo.

---

## Changelogs

- **Sempre** mantenha `CHANGELOG.md` em pacotes publicáveis e apps com release notável.
- **Sempre** siga [Keep a Changelog](https://keepachangelog.com/) e versionamento semântico.
- **Sempre** descreva mudanças em termos de **impacto para o consumidor**, não detalhes internos.
- **Sempre** marque breaking changes com `BREAKING:` no início da linha.
- **Nunca** gere changelog manualmente quando houver convenção de commits suportada pelo tooling — automatize.
- **Nunca** liste commits cruus como changelog.

---

## Diagramas

- **Sempre** use diagramas para fluxos de mais de três participantes ou estados.
- **Sempre** prefira diagramas **como código** (Mermaid, PlantUML, D2) versionáveis em git.
- **Sempre** mantenha o diagrama no mesmo commit da mudança que o invalida.
- **Nunca** versione diagramas como imagem PNG sem fonte versionada ao lado.
- **Nunca** crie diagrama decorativo que não esclarece nada além do nome do componente.

---

## Localização e staleness

- **Sempre** mantenha a documentação **o mais próxima possível do código** que ela descreve.
- **Sempre** trate documentação desatualizada como bug — apague ou conserte, não ignore.
- **Sempre** delete documentação cujo código já não existe.
- **Sempre** automatize a documentação quando o conteúdo for derivável do código (schemas, tipos, rotas).
- **Nunca** mantenha wiki externa contendo regras que poderiam viver em `.contexts/`.
- **Nunca** confie em documentação que não foi tocada no mesmo PR que mudou o código relacionado.

---

## Documentação para IA e agentes

- **Sempre** mantenha documentação consumível por LLMs em markdown puro, sem HTML, sem JS embarcado.
- **Sempre** use referências cruzadas via `@<caminho>` para que agentes resolvam contexto sem duplicação.
- **Sempre** estruture documentos com cabeçalhos previsíveis para indexação determinística.
- **Sempre** declare metadados de versão e status em frontmatter YAML quando aplicável.
- **Nunca** use jargão interno não-definido sem glossário — agentes alucinam quando o termo é ambíguo.
- **Nunca** escreva instruções para agente em prosa narrativa quando regra imperativa cabe.

---

## Diátaxis (organização macro de documentação de produto)

Quando o repositório expõe documentação para consumidores externos (não apenas para o time interno), aplique [Diátaxis](https://diataxis.fr/):

- **Sempre** classifique cada documento em **um** dos quatro modos: tutorial, how-to, reference, explanation.
- **Sempre** mantenha modos separados em diretórios distintos.
- **Nunca** misture tutorial (aprendizado guiado) com how-to (resolução de problema específico) no mesmo documento.
- **Nunca** misture reference (descrição técnica) com explanation (discussão conceitual) no mesmo documento.

Esta seção **não** se aplica à documentação interna de engenharia em `.contexts/`, que segue o framework DDC.

---

## Anti-patterns

- Comentário que repete o nome da função.
- README de 500 linhas que ninguém lê.
- `// TODO` órfão sem dono nem issue.
- Wiki externa como fonte de verdade desconectada do código.
- Diagrama em PNG sem fonte versionada.
- Documentação que descreve como o sistema **deveria** funcionar em vez de como funciona.
- ADR sendo editado para refletir nova decisão em vez de novo ADR superseding o anterior.
- JSDoc em função privada de uma linha.
- Código comentado convivendo com a versão ativa "por garantia".

---

## Referências cruzadas

- Práticas de redação de código limpo: `@.contexts/engineering/practices/clean-code.md`
- Modelos arquiteturais documentados: `@.contexts/engineering/architecture/`
- Decisões técnicas registradas: `@.contexts/engineering/decisions/`
- Convenções de modelagem de fronteiras: `@.contexts/engineering/contracts/`
- Processo de release e changelog automatizado: `@.contexts/engineering/processes/release.md`
- Regras de code review (inclui revisão de documentação no PR): `@.contexts/engineering/rules/code-review.md`
- Regras de desenvolvimento (nomes, refatoração antes de comentar): `@.contexts/engineering/rules/development.md`
