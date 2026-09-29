---
title: Regras de Observability
type: rules
status: active
scope: engineering
last_updated: 2026-05-20
---

# Regras de Observability

Regras imperativas sobre como instrumentar o código para que sistemas em produção sejam observáveis. Tudo que você escreve deve emitir sinais suficientes para diagnosticar falhas sem precisar reproduzir o bug localmente.

Erros e exceções estruturadas são governados por `@.contexts/engineering/rules/error-handling.md`. Performance e latência têm targets em `@.contexts/engineering/rules/performance.md`. Redação de PII e segredos é definida em `@.contexts/engineering/rules/security.md`. Métricas de cache vivem em `@.contexts/engineering/rules/caching.md`.

## Os três pilares

- **Use logs, metrics e traces como pilares distintos**. Logs descrevem eventos discretos, métricas agregam números ao longo do tempo, traces conectam operações distribuídas. Nunca substitua um pelo outro.
- **Não emita métrica como log**. Counters, gauges e histograms vão para o backend de métricas, não para `console.log`.
- **Não emita log como métrica**. Não conte ocorrências fazendo `grep` em logs em produção; emita um counter.
- **Não emita trace como log**. Spans vivem no exporter OTel, não em `console.log("entrando em função X")`.

## Structured logging

- **Sempre emita logs como JSON estruturado**. Nunca use `console.log` com string concatenation ou template literals como formato principal de log em produção.
- **Use um logger central** (`logger.info`, `logger.warn`, `logger.error`) que sempre serializa para JSON. Nunca importe `console` diretamente em código de runtime.
- **Mantenha schema estável de log**. Campos com mesmo nome carregam mesmo tipo em toda a aplicação (`userId` é sempre string, `durationMs` é sempre number).
- **Use snake_case ou camelCase consistentemente em todos os campos de log**. Não misture os dois estilos.
- **Sempre inclua `timestamp`, `level`, `message`, `service`, `env`** em todo log emitido. Adicione `requestId` ou `traceId` quando disponível no contexto.
- **Mensagem do log é descritiva e estável**, não interpolada. Use `logger.info("user signed in", { userId })` ao invés de `logger.info(`user ${userId} signed in`)`. A mensagem precisa ser agrupável.
- **Não logue objetos grandes inteiros**. Extraia campos relevantes; arrays e payloads completos vão para storage separado, não para o stream de logs.

## Níveis de log

- **`debug`**: informação detalhada útil apenas em desenvolvimento ou troubleshooting profundo. Desligado em produção por padrão.
- **`info`**: eventos de negócio significativos (login, criação de recurso, conclusão de job). Devem ser revisáveis sem ruído.
- **`warn`**: condições inesperadas que o sistema conseguiu tratar (retry, fallback, validação rejeitada). Não acordam ninguém, mas merecem atenção.
- **`error`**: falhas que requerem investigação. Sempre incluem stack trace e contexto suficiente para reproduzir.
- **Nunca use `error` para fluxo esperado** (ex: validação de input do usuário não é `error`, é `warn` ou nem isso).
- **Nunca use `info` para tudo**. Se cada operação emite cinco `info`, ninguém lê nenhum.
- **Não logue a mesma falha em múltiplos níveis** subindo na stack. Logue uma vez no ponto onde a decisão é tomada.

## Correlation e contexto

- **Sempre propague `traceId` e `spanId` cruzando fronteiras** (HTTP, fila, função). Use OpenTelemetry context propagation; não invente headers próprios.
- **Toda requisição HTTP recebe um `requestId`** atribuído no edge (middleware no Next.js, gateway, ou pelo runtime). Esse ID aparece em todo log, métrica de exemplar e span da requisição.
- **Headers padrão de propagação são `traceparent` e `tracestate`** (W3C Trace Context). Não use `X-Request-ID` como substituto de trace context.
- **Em jobs assíncronos e mensagens em fila**, serialize o trace context no envelope da mensagem e restaure-o no consumidor. O trace começa no producer, não no consumer.
- **Use AsyncLocalStorage (Node) ou equivalente** para carregar contexto através de chamadas sem passar `ctx` em todo lugar.

## OpenTelemetry

- **OpenTelemetry é o padrão de instrumentação**. Não use SDK proprietário de vendor para tracing/metrics; use OTel e configure o exporter para o vendor.
- **Use semantic conventions oficiais (semconv)** para atributos de span: `http.method`, `http.status_code`, `db.system`, `messaging.system`, `gen_ai.system`. Não invente atributos quando existe convenção.
- **Crie spans com nomes baseados em operação, não em endpoint completo**. Use `GET /users/:id`, nunca `GET /users/123`.
- **Adicione atributos relevantes no span**, não em logs paralelos. Atributos de span são consultáveis no backend de tracing.
- **Marque spans com erro via `span.recordException(err)` e `span.setStatus({ code: ERROR })`**. Nunca apenas logue e ignore o span.
- **Feche todo span criado**. Span órfão polui o trace. Use `try/finally` ou wrappers que garantem fechamento.

## Métricas

- **Use o tipo correto**: `Counter` para contagens monotônicas, `UpDownCounter` para valores que sobem e descem, `Histogram` para distribuições (latência, tamanho), `Gauge` para snapshots instantâneos.
- **Nunca use `Counter` para latência**. Latência é `Histogram`.
- **Mantenha cardinalidade baixa em labels**. Não use `userId`, `requestId`, `email`, ou qualquer campo de alta cardinalidade como label. Use-os em logs e exemplars.
- **Cardinalidade total de uma métrica não excede ~1000 séries**. Acima disso, custo de storage explode e queries ficam lentas.
- **Nomes de métrica seguem `<dominio>_<medida>_<unidade>`**: `http_server_request_duration_seconds`, `db_query_duration_milliseconds`, `queue_messages_processed_total`.
- **Counters terminam em `_total`**. Histograms de duração terminam em `_seconds` ou `_milliseconds` (escolha um e mantenha).
- **Não exponha métricas internas de runtime sem necessidade**. Cada métrica adicional custa cardinalidade no backend.

## RED e USE

- **Para cada serviço que recebe requisições, exponha RED**: Rate (req/s), Errors (req/s com falha), Duration (histograma de latência).
- **Para cada recurso (CPU, memória, conexão, worker), exponha USE**: Utilization, Saturation, Errors.
- **Não construa dashboard sem RED ou USE**. Se um dashboard não responde "está rápido? está errado? está saturado?", está incompleto.

## SLI, SLO e alertas

- **Defina SLI antes de configurar alerta**. Sem indicador formal, alertas viram ruído.
- **Alertas são sobre sintomas observáveis pelo usuário, não causas internas**. Alerta em "latência p95 > 500ms", não em "CPU > 80%".
- **Todo alerta tem runbook**. Se não existe ação clara para resolver, não existe alerta.
- **Alertas pageáveis (acordam alguém) só para violação de SLO em produção**. Tudo mais vai para canal de notificação não-urgente.
- **Use error budget para decidir prioridade**. Quando o budget está saudável, priorize features; quando está esgotado, congele e estabilize.

## PII, segredos e redaction

- **Nunca logue PII, segredos, tokens, senhas, cookies de sessão, headers de autorização**. Veja `@.contexts/engineering/rules/security.md` para a lista completa.
- **Configure redaction no logger central**, não em cada call site. Campos sensíveis são removidos antes de serializar.
- **Nunca logue request body inteiro de endpoint que aceita PII**. Logue metadados (tamanho, content-type, status), não conteúdo.
- **Nunca logue response body de chamada a API de terceiros que pode conter PII**. Logue duração, status e erro estruturado.
- **Atributos de span seguem a mesma regra que logs**. Não coloque token em `gen_ai.request.api_key`.
- **`Error.message` pode vazar dados sensíveis**. Sanitize antes de logar ou usar como atributo.

## Observabilidade de LLM

- **Toda chamada a modelo emite span com atributos `gen_ai.*`** (semconv para GenAI): `gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.response.finish_reasons`.
- **Sempre registre tokens de input e output** como atributo do span e como métrica agregada por modelo.
- **Sempre registre custo estimado em USD por chamada** como métrica, derivado dos tokens e do preço do modelo. Custo é o principal sinal de saúde de produto LLM.
- **Registre latência por modelo e por endpoint separadamente** (`openai`, `gemini`, modelo X vs modelo Y). Latência de LLM é bimodal — agregar mascara regressões.
- **Nunca logue prompt completo nem response completo em produção por padrão**. Configure sampling explícito (ex: 1% das chamadas para storage de debug) e nunca para casos com PII.
- **Registre `finish_reason`** (stop, length, content_filter, tool_calls) como atributo. Mudanças de distribuição indicam regressão de prompt.
- **Tool calls emitem spans filhos** do span da chamada ao modelo, com atributos `gen_ai.tool.name` e duração.

## Jobs, queues e workers

- **Toda execução de job emite um span raiz** com `messaging.operation` e `messaging.system`.
- **Restaure o trace context do envelope da mensagem** ao iniciar o processamento. O span do consumer é filho do span do producer.
- **Métricas obrigatórias por worker**: mensagens recebidas (counter), processadas com sucesso (counter), falhadas (counter), duração (histogram), idade da mensagem ao iniciar processamento (histogram).
- **Sempre logue o ID da mensagem ao processar**. Sem isso, debugging cross-service é impossível.
- **Falha de processamento é `error` no logger e marca o span como erro**, mas não dispara alerta por mensagem individual — alerte na taxa.

## Health checks

- **`liveness` indica se o processo precisa ser reiniciado**. Falha apenas se o processo está irrecuperável.
- **`readiness` indica se o processo pode receber tráfego**. Falha durante warm-up, durante drain, ou quando dependências críticas estão indisponíveis.
- **Nunca use a mesma resposta para liveness e readiness**. Falhar liveness causa restart; falhar readiness apenas remove do load balancer.
- **Health check não chama todas as dependências**. Cheque o essencial; tudo mais vai para métricas.
- **Health check não vaza informação interna** (versões, configs, contagens) sem autenticação.

## Sampling

- **Amostragem de trace é decisão no edge, propagada via `tracestate`**. Não amostre independentemente em cada serviço.
- **Sempre amostre 100% de erros e operações lentas** (tail-based sampling) quando o backend suportar. Head-based sampling perde os casos interessantes.
- **Log sampling é aceitável para `info` de alto volume**, nunca para `warn` ou `error`. Documente a taxa.
- **Defina taxa de sampling por rota/job**, não global. Endpoints raros precisam de mais sinal, endpoints quentes precisam de menos.

## Overhead de instrumentação

- **Instrumentação não excede 5% de overhead de CPU/latência** em produção. Acima disso, reduza atributos, sampling, ou frequência.
- **Não crie span dentro de loop apertado**. Crie um span pai com atributo `iterations` e métrica de duração agregada.
- **Não construa string de log que não será emitida**. Cheque o nível antes ou use logger que lazy-evalua.
- **Exportação de telemetria é assíncrona e batched**. Nunca flush síncrono no hot path.

## Anti-patterns

- **Nunca logue e em seguida `throw` o mesmo erro**. O handler de erro central loga. Ver `@.contexts/engineering/rules/error-handling.md`.
- **Nunca capture exceção apenas para logar e re-lançar sem contexto adicional**. Ou adicione contexto, ou deixe propagar.
- **Nunca emita o mesmo log em múltiplas camadas** (controller, service, repository) para a mesma operação. Escolha o nível certo e logue uma vez.
- **Nunca use `console.log` em código de runtime**. Apenas em scripts locais e testes.
- **Nunca silencie erro com `catch {}` vazio**. Se decidir ignorar, logue como `debug` com justificativa.
- **Nunca logue dentro de loop sem agregação**. Logue resultado consolidado, não cada iteração.
- **Nunca instrumente código de teste com o logger de produção**. Testes usam logger silencioso ou capturam saída.
- **Nunca confunda log de auditoria com log operacional**. Auditoria tem requisitos de retenção e imutabilidade diferentes; vai para sink próprio.
- **Nunca configure alerta sem owner**. Alerta órfão é descartado em três meses.

## Onde aplicar

- Toda função exportada que cruza fronteira de I/O (HTTP, DB, fila, LLM, filesystem, serviço externo) deve estar instrumentada com span e métricas RED.
- Todo handler de rota em Next.js Route Handler ou Firebase Function abre span raiz e propaga contexto.
- Toda chamada a Vercel AI SDK / OpenAI / Gemini emite span com `gen_ai.*` e atualiza métrica de custo.
- Toda query a PostgreSQL emite span com `db.system=postgresql` e atributos semconv de banco.
- Todo job de fila instrumenta producer e consumer com trace context propagado.

## Referências cruzadas

- Tratamento estruturado de erros e quando lançar versus capturar: `@.contexts/engineering/rules/error-handling.md`.
- Latência alvo, budgets e otimização: `@.contexts/engineering/rules/performance.md`.
- Redação de PII, segredos e dados sensíveis: `@.contexts/engineering/rules/security.md`.
- Hit rate de cache e métricas de invalidação: `@.contexts/engineering/rules/caching.md`.
- Modelagem de envelopes e propagação de contexto em eventos de domínio: `@.contexts/engineering/contracts/events.md`.
- Configuração específica de logging e tracing em Firebase Functions: `@.contexts/engineering/stacks/backend/firebase-functions.md`.
