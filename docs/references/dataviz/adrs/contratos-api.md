# ADR-007 — Contratos de API REST para Serviços Internos

| Campo            | Valor                                          |
|------------------|------------------------------------------------|
| **Status**       | ✅ ACEITO                                       |
| **Data**         | Março 2025                                     |
| **Domínio**      | Plataforma / Integração                        |
| **Impacto**      | Alto — afeta todos os serviços internos        |
| **Autores**      | Time de Plataforma                             |
| **Revisores**    | Tech Leads, Arquitetura                        |
| **Próxima revisão** | Setembro 2025                               |

---

## Histórico de Revisões

| Versão | Data      | Autor                      | Descrição                                  |
|--------|-----------|----------------------------|--------------------------------------------|
| 0.1    | Jan 2025  | Time de Plataforma         | Rascunho inicial — RFC interno             |
| 0.9    | Fev 2025  | Arquitetura + Tech Leads   | Revisão e consolidação do feedback         |
| 1.0    | Mar 2025  | CTO + Arquitetura          | Aceito — versão normativa                  |

---

## 1. Contexto

À medida que a plataforma evolui para uma arquitetura orientada a serviços, múltiplos serviços internos precisam se comunicar de forma confiável, segura e evolutiva. Na ausência de um contrato explícito, cada equipe adota convenções próprias de nomenclatura, serialização, tratamento de erros e autenticação, gerando fricção na integração, erros difíceis de diagnosticar e alto custo de manutenção.

> ⚡ **Problema Raiz**
> Sem uma decisão arquitetural formal, os serviços acumulam contratos implícitos, divergentes e frágeis. Uma mudança unilateral em qualquer endpoint pode cascatear falhas silenciosas em consumidores que não foram notificados.

### 1.1 Forças em Jogo

| Força                    | Manifestação no Projeto                                                                 |
|--------------------------|------------------------------------------------------------------------------------------|
| Autonomia das equipes    | Times independentes entregam em ritmos distintos e escolhem stacks heterogêneas          |
| Acoplamento de versão    | Consumidores dependem de detalhes de implementação do provedor                           |
| Observabilidade          | Erros sem estrutura dificultam correlação de traces entre serviços                       |
| Segurança                | Endpoints sem contrato explícito omitem autenticação ou expõem dados sensíveis           |
| Onboarding               | Novos desenvolvedores e agentes de IA não encontram documentação confiável               |
| Resiliência              | Ausência de padrão de retry/timeout gera cascata de falhas                               |

---

## 2. Decisão

Adotamos **OpenAPI 3.1 como formato canônico de contrato** para todas as APIs REST internas, com um conjunto normativo de convenções de design detalhadas a seguir. O contrato é a única fonte de verdade (*single source of truth*) — a implementação deve ser validada contra o contrato, não o contrário.

> ✅ **Princípio Central**
> "O contrato é escrito antes do código." — API-first design.
> Toda breaking change exige um novo major de versão e período de deprecação.

---

### 2.1 Padrões de Design de Recursos

#### Nomenclatura de Endpoints

| Regra                            | Exemplo Correto                       |
|----------------------------------|---------------------------------------|
| URI em substantivos no plural, kebab-case | `/payment-orders`            |
| Hierarquia expressa por aninhamento | `/orders/{id}/items`               |
| Ações não-CRUD via sub-recurso   | `POST /orders/{id}/cancel`            |
| Versão no path, prefixo          | `/v1/payment-orders`                  |
| Sem trailing slash               | `/v1/orders` ✓  &nbsp; `/v1/orders/` ✗ |

#### Verbos HTTP e Semântica

| Verbo    | Semântica                             | Idempotente | Body |
|----------|---------------------------------------|:-----------:|:----:|
| `GET`    | Leitura de recurso ou coleção         | Sim         | Não  |
| `POST`   | Criação de recurso / ação             | Não         | Sim  |
| `PUT`    | Substituição completa                 | Sim         | Sim  |
| `PATCH`  | Atualização parcial (JSON Merge Patch)| Não         | Sim  |
| `DELETE` | Remoção de recurso                    | Sim         | Não  |

#### Estrutura de Payload

Todo payload segue o envelope padrão abaixo. O campo `data` é omitido em respostas de erro.

```json
{
  "data": { ... },
  "meta": {
    "requestId": "uuid-v4",
    "timestamp": "ISO-8601",
    "version": "1.0.0"
  }
}
```

#### Paginação

| Parâmetro   | Tipo              | Descrição                                              |
|-------------|-------------------|--------------------------------------------------------|
| `page`      | integer ≥ 1       | Número da página (base 1)                              |
| `pageSize`  | integer 1–100     | Itens por página, padrão 20                            |
| `sort`      | string            | Campo + direção, ex: `created_at:desc`                 |
| `cursor`    | string (opaco)    | Cursor opaco para paginação keyset (coleções grandes)  |

---

### 2.2 Estratégia de Versionamento

Adotamos **versionamento por path (URI versioning)**. O número de versão major é o único discriminador de contrato.

| Tipo de Mudança                              | Breaking? | Ação Necessária                          |
|----------------------------------------------|:---------:|------------------------------------------|
| Adicionar campo opcional                     | Não       | Nenhuma — retrocompatível                |
| Adicionar novo endpoint                      | Não       | Nenhuma — retrocompatível                |
| Remover campo obrigatório                    | Sim       | Novo major + período de deprecação       |
| Alterar tipo de campo existente              | Sim       | Novo major + período de deprecação       |
| Renomear campo ou remover endpoint           | Sim       | Novo major + período de deprecação       |
| Alterar semântica de campo sem mudar nome    | Sim       | Novo major + período de deprecação       |

> 📌 **Política de Deprecação**
> - Versões depreciadas devem responder com o header: `Deprecation: date="YYYY-MM-DD"`
> - Período mínimo de coexistência: **90 dias**
> - Comunicação obrigatória via canal `#platform-apis` no Slack com changelog

---

### 2.3 Tratamento de Erros

Todos os erros seguem o formato **RFC 9457 (Problem Details)**.

```json
{
  "type":     "https://api.example.com/errors/validation-failed",
  "title":    "Validation Failed",
  "status":   422,
  "detail":   "O campo email não é válido.",
  "instance": "/v1/users/42",
  "traceId":  "abc-123",
  "errors":   [ ... ]
}
```

#### Mapeamento de Status HTTP

| HTTP Status                   | Quando usar                                                    |
|-------------------------------|----------------------------------------------------------------|
| `200 OK`                      | Leitura/atualização bem-sucedida com corpo                     |
| `201 Created`                 | Criação bem-sucedida — inclui `Location` header                |
| `204 No Content`              | Sucesso sem corpo (DELETE, ação sem retorno)                   |
| `400 Bad Request`             | Payload malformado, JSON inválido                              |
| `401 Unauthorized`            | Token ausente ou inválido                                      |
| `403 Forbidden`               | Token válido, mas sem permissão no recurso                     |
| `404 Not Found`               | Recurso não existe                                             |
| `409 Conflict`                | Conflito de estado (duplicidade, versão desatualizada)         |
| `422 Unprocessable Entity`    | Regras de negócio ou validação de domínio falha                |
| `429 Too Many Requests`       | Rate limit atingido — incluir `Retry-After` header             |
| `500 Internal Server Error`   | Erro inesperado — não vaze stack trace                         |
| `503 Service Unavailable`     | Serviço indisponível temporariamente                           |

---

### 2.4 Autenticação e Autorização

| Aspecto                  | Decisão                                                                          |
|--------------------------|----------------------------------------------------------------------------------|
| Mecanismo                | JWT (Bearer Token) via `Authorization` header                                    |
| Algoritmo                | RS256 — chave pública distribuída via JWKS endpoint                              |
| Expiração do token       | 15 minutos para access token, 24h para refresh token                             |
| Escopo                   | Claims de escopo granular no payload: `"scope": ["orders:read", "orders:write"]` |
| Service-to-Service       | Client Credentials Flow (OAuth 2.0) — sem interação do usuário                   |
| Propagação de identidade | Headers `X-Request-ID` + `X-User-ID` propagados obrigatoriamente                |

---

### 2.5 Headers Obrigatórios

| Header              | Direção          | Descrição                                                              |
|---------------------|------------------|------------------------------------------------------------------------|
| `Authorization`     | Request          | `Bearer <jwt-token>`                                                   |
| `Content-Type`      | Request/Response | `application/json; charset=utf-8`                                      |
| `Accept`            | Request          | `application/json`                                                     |
| `X-Request-ID`      | Request          | UUID v4 gerado pelo client — propagado end-to-end                      |
| `X-Correlation-ID`  | Request          | ID de rastreamento cross-service (pode ser igual ao Request-ID)        |
| `X-User-ID`         | Request          | ID do usuário autenticado (se aplicável)                               |
| `Deprecation`       | Response         | Data de deprecação do endpoint (quando aplicável)                      |
| `Retry-After`       | Response         | Segundos para aguardar após `429` ou `503`                             |

---

### 2.6 Observabilidade e Rastreabilidade

| Requisito                | Implementação                                                                              |
|--------------------------|--------------------------------------------------------------------------------------------|
| Correlação de chamadas   | `X-Request-ID` propagado em todos os serviços downstream                                   |
| Structured logging       | JSON com campos: `timestamp`, `level`, `service`, `traceId`, `userId`, `duration_ms`       |
| Métricas mínimas         | Latência p50/p95/p99, taxa de erros 4xx/5xx, throughput por endpoint                       |
| Health check             | `GET /health` → `200 OK` com status de dependências                                        |
| Readiness probe          | `GET /ready` → `200 OK` apenas quando pronto para tráfego                                  |
| Rastreamento distribuído | W3C Trace Context (`traceparent` / `tracestate` headers)                                   |

---

### 2.7 Gestão do Contrato OpenAPI

| Prática              | Descrição                                                                                   |
|----------------------|---------------------------------------------------------------------------------------------|
| Localização do spec  | Raiz do repositório: `/api/openapi.yaml`                                                    |
| Validação em CI      | `spectral lint --ruleset .spectral.yaml openapi.yaml` — falha no pipeline se inválido       |
| Contract testing     | Dredd ou Schemathesis contra o spec antes do merge para `main`                              |
| Documentação         | Publicação automática no portal interno via pipeline CD                                     |
| Revisão              | PR obrigatória com aprovação de pelo menos 1 Tech Lead consumidor                           |
| Changelog            | `CHANGELOG.md` atualizado em toda PR que modifica `openapi.yaml`                            |

---

## 3. Status

**✅ ACEITO**

---

## 4. Consequências

### 4.1 Benefícios Esperados

- Contratos explícitos reduzem bugs de integração e diminuem o tempo de onboarding de novos serviços.
- Documentação automática via OpenAPI elimina documentação desatualizada.
- Contract testing no CI detecta breaking changes antes do deploy.
- Padrão de erros RFC 9457 facilita diagnóstico e tratamento genérico por consumidores.
- Rastreabilidade por `X-Request-ID` viabiliza correlação de logs em investigações de incidentes.
- Agentes de IA têm superfície de contexto confiável para gerar integrações sem suposições implícitas.

### 4.2 Trade-offs e Custos

| Trade-off                                         | Mitigação                                                                           |
|---------------------------------------------------|-------------------------------------------------------------------------------------|
| Overhead inicial de escrita do spec               | Templates e generators (`openapi-generator`) reduzem trabalho manual                |
| Curva de aprendizado em OpenAPI 3.1               | Workshops internos + documentação de exemplos no portal                             |
| Contract testing aumenta tempo de CI              | Paralelização de stages; testes de contrato em branch separada                      |
| Rigidez pode atrasar experimentação               | Feature flags desacoplam deploy de release; endpoints experimentais via `X-Feature` header |
| Versionamento por path duplica rotas              | Routers com alias reduzem duplicidade no código fonte                               |

### 4.3 Riscos Residuais

- Serviços legados não cobertos por esta ADR podem ter contratos divergentes durante período de migração.
- Drift entre spec e implementação se pipeline de validação for desabilitado por exceção.
- Dependência do portal de documentação para descoberta de contratos.

---

## 5. Alternativas Consideradas

| Alternativa                           | Por que foi descartada                                                                                                                                     |
|---------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **gRPC (Protocol Buffers)**           | Curva de aprendizado elevada, ecossistema de ferramentas menos maduro para debugging interno, incompatibilidade com clientes HTTP padrão                   |
| **GraphQL**                           | Complexidade de segurança (introspection attacks, query depth), persisted queries exigem infraestrutura adicional; REST é suficiente para serviços internos |
| **AsyncAPI (mensageria como primário)**| Fluxos internos são predominantemente síncronos com SLAs de latência definidos; mensageria complementa mas não substitui REST                             |
| **Contrato implícito (sem spec)**     | Status quo problemático que motivou esta ADR — gera acoplamento frágil e impossibilita contract testing automatizado                                        |
| **RAML / API Blueprint**              | Menor adoção da comunidade, ecossistema de tooling inferior ao OpenAPI 3.x; OpenAPI é o padrão de facto da indústria                                        |
| **Header versioning** (`Accept: application/vnd.api+json;v=2`) | Mais difícil de testar, debugar e cachear; menor legibilidade em logs e menor adoção em ferramentas padrão              |

---

## 6. Guia para Product Requirement Prompts (PRPs)

> 🤖 **Instruções para Agentes de IA**
>
> - Ao gerar código de integração entre serviços: valide se o endpoint segue `/v{n}/{recurso-plural}`.
> - Ao modelar payloads de resposta: sempre inclua o envelope `{ data, meta }` com `requestId`.
> - Ao modelar erros: use RFC 9457 com os campos `type`, `title`, `status`, `detail`, `traceId`.
> - Ao criar novos endpoints: gere o spec OpenAPI 3.1 **antes** do código de implementação.
> - Ao alterar contratos existentes: classifique a mudança como *breaking* ou *non-breaking* antes de propor.
> - Toda chamada deve propagar `X-Request-ID` e `X-Correlation-ID` nos headers.

### 6.1 Checklist de Conformidade

- [ ] URI usa substantivos no plural em kebab-case
- [ ] Versão de API presente no path (`/v1/...`)
- [ ] Resposta de sucesso segue envelope `{ data, meta }`
- [ ] Erros seguem RFC 9457 com `traceId`
- [ ] Status HTTP correto para cada cenário (ver seção 2.3)
- [ ] Headers obrigatórios documentados (`X-Request-ID`, `Authorization`)
- [ ] Spec OpenAPI 3.1 criado/atualizado
- [ ] Mudança classificada como *breaking* ou *non-breaking*
- [ ] Período de deprecação respeitado para breaking changes

---

## 7. Referências

| Recurso                          | Link / Localização                                             |
|----------------------------------|----------------------------------------------------------------|
| OpenAPI Specification 3.1        | https://spec.openapis.org/oas/v3.1.0                           |
| RFC 9457 – Problem Details       | https://www.rfc-editor.org/rfc/rfc9457                         |
| RFC 7807 (predecessor)           | https://www.rfc-editor.org/rfc/rfc7807                         |
| JSON Merge Patch (RFC 7396)      | https://www.rfc-editor.org/rfc/rfc7396                         |
| W3C Trace Context                | https://www.w3.org/TR/trace-context/                           |
| OAuth 2.0 Client Credentials     | https://www.rfc-editor.org/rfc/rfc6749#section-4.4             |
| Spectral – OpenAPI Linting       | https://stoplight.io/open-source/spectral                      |
| Schemathesis – Contract Testing  | https://schemathesis.io/                                       |
| Portal interno de APIs           | `/docs/api-portal` (intranet)                                  |
| Template OpenAPI interno         | `/templates/openapi-base.yaml` (repositório platform)          |

---

> 📝 **Nota de Governança**
> Esta ADR é um documento vivo. Mudanças relevantes na estratégia de APIs devem ser propostas via PR no repositório de decisões arquiteturais, com revisão obrigatória do time de Plataforma e ao menos dois Tech Leads de serviços consumidores.