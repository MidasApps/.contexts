# Caching Rules

Regras imperativas para caching em todas as camadas do sistema. Para semântica específica do framework, ver `@.contexts/engineering/stacks/frontend/next@16.md`. Para impacto em latência e throughput, ver `@.contexts/engineering/rules/performance.md`. Para risco de vazamento de dados em cache, ver `@.contexts/engineering/rules/security.md`.

## Quando cachear

- **Sempre** cacheie respostas determinísticas, idempotentes e de leitura frequente.
- **Sempre** avalie a fórmula custo-benefício antes de cachear: ganho em latência/custo × tolerância a staleness.
- **Nunca** cacheie escrita. Cache é exclusivamente leitura ou derivação de leitura.
- **Nunca** cacheie respostas com taxa de mudança maior que a taxa de leitura — o cache vira overhead.
- **Nunca** cacheie respostas de erro 5xx. Cacheie 4xx apenas com TTL curto e explícito.
- **Não** cacheie dados que não toleram nenhum nível de staleness (saldo financeiro pós-transação, estado de autenticação ativa, contadores em tempo real).
- **Não** introduza cache para "talvez melhorar". Meça primeiro, cacheie depois.

## Camadas de cache

Aplique a regra do **menor escopo viável**: cacheie no nível mais próximo do consumidor que ainda preserva correção.

- **Browser cache (HTTP):** assets estáticos, respostas de GET públicas e imutáveis.
- **CDN/Edge:** respostas globais não-personalizadas, assets com hash de conteúdo.
- **Server memory (in-process):** lookups quentes, dedupe de requisições no escopo da request.
- **Distributed cache (Redis, Memorystore):** dados compartilhados entre instâncias, sessões, rate limits.
- **Database query cache:** somente quando o banco oferece nativamente; nunca implemente cache de query manual sobre o driver.

- **Nunca** duplique a mesma chave em múltiplas camadas sem estratégia explícita de invalidação coordenada.
- **Nunca** assuma que invalidar uma camada invalida as demais.

## Chaves de cache

- **Sempre** componha chaves determinísticas: mesmos inputs produzem a mesma chave, sempre.
- **Sempre** namespace a chave com prefixo de domínio e versão: `users:v2:profile:{userId}`.
- **Sempre** incremente a versão da chave quando o shape do valor muda. Não migre cache; invalide por versão.
- **Sempre** hashe inputs longos, complexos ou contendo caracteres especiais antes de compor a chave.
- **Nunca** inclua PII (email, CPF, telefone, nome completo) em texto claro dentro da chave. Hashe ou use ID interno.
- **Nunca** use timestamps de relógio na chave — quebra determinismo e infla cardinalidade.
- **Nunca** componha chave concatenando strings sem separador inequívoco (`:` ou `|`); use separador reservado e proíba-o nos componentes.

## TTL e invalidação

- **Sempre** defina TTL explícito em toda entrada. TTL infinito é proibido sem mecanismo de invalidação por evento.
- **Sempre** prefira invalidação por evento (tag, path, key) sobre TTL curto quando o evento de mudança é conhecido.
- **Sempre** combine TTL como rede de segurança com invalidação por evento como mecanismo primário.
- **Sempre** use TTLs assimétricos: leitura frequente + mudança rara = TTL longo; leitura rara + mudança frequente = não cacheie.
- **Nunca** invalide cache de forma síncrona no caminho de escrita crítico se a operação puder ser eventual.
- **Nunca** dependa exclusivamente de TTL para dados que precisam refletir mudanças imediatas pós-escrita; invalide explicitamente.
- **Não** use o mesmo TTL para todas as entradas. Distribua por natureza do dado.

## Stale-while-revalidate

- **Sempre** prefira `stale-while-revalidate` para leituras de alta frequência onde staleness curta é aceitável.
- **Sempre** defina explicitamente o janelamento `max-age` + `stale-while-revalidate` em respostas HTTP públicas.
- **Nunca** sirva resposta stale para dados de autorização, billing ou estado financeiro.

## Cache stampede

- **Sempre** proteja recomputações caras com single-flight (apenas uma requisição recomputa, demais aguardam o resultado).
- **Sempre** aplique jitter ao TTL (`TTL ± aleatório`) para evitar expiração em massa síncrona.
- **Sempre** use lock distribuído com timeout curto quando recomputação atravessa múltiplas instâncias.
- **Nunca** deixe múltiplas instâncias recomputarem o mesmo valor caro em paralelo sem coordenação.
- **Nunca** use lock sem timeout — lock órfão paralisa o cache.

## Estratégia de leitura/escrita

- **Sempre** use **cache-aside** como padrão: aplicação lê do cache; em miss, lê da fonte e popula o cache.
- **Sempre** use **write-through** quando a escrita deve refletir imediatamente nas leituras subsequentes e o custo de escrita dupla é aceitável.
- **Sempre** invalide (não atualize) o cache na escrita quando a coerência entre cache e fonte é crítica e o write-through não é viável.
- **Nunca** use write-behind para dados que não toleram perda em falha de instância.
- **Não** popule cache em endpoints de escrita com dados derivados não validados pela leitura — popule no próximo read.

## Escopo: por-usuário vs global

- **Sempre** inclua o identificador do principal (userId, tenantId, orgId) na chave quando o valor depende do contexto autenticado.
- **Sempre** isole cache de tenant por namespace ou instância dedicada em sistemas multi-tenant.
- **Nunca** compartilhe entrada de cache entre usuários quando o conteúdo é derivado de permissão, role ou dado pessoal.
- **Nunca** cacheie respostas autenticadas em CDN sem `Cache-Control: private` ou chave que inclua o principal.

## HTTP caching headers

- **Sempre** envie `Cache-Control` explícito em toda resposta. Ausência = comportamento indefinido entre proxies.
- **Sempre** use `Cache-Control: public, max-age=N, stale-while-revalidate=M` para respostas globais.
- **Sempre** use `Cache-Control: private, max-age=N` para respostas personalizadas que podem ser cacheadas no browser.
- **Sempre** use `Cache-Control: no-store` para respostas com dados sensíveis ou autenticação ativa.
- **Sempre** emita `ETag` para respostas grandes ou caras, permitindo revalidação condicional com 304.
- **Sempre** declare `Vary` para todo header que muda a resposta (`Accept-Encoding`, `Accept-Language`, `Authorization`).
- **Nunca** use `no-cache` quando o que se quer é `no-store`. `no-cache` permite armazenamento; bloqueia apenas reuso sem revalidação.
- **Nunca** omita `Vary: Authorization` em respostas autenticadas servidas por proxies compartilhados.

## Cache de respostas de LLM

- **Sempre** normalize o prompt antes de compor a chave: trim, colapso de whitespace, lowercase quando semanticamente irrelevante.
- **Sempre** inclua na chave: modelo, versão do modelo, temperatura, system prompt hash, prompt hash, top_p e qualquer parâmetro que altere a saída.
- **Sempre** hashe o prompt completo (SHA-256) — não armazene prompt em texto claro na chave.
- **Sempre** defina TTL para cache de LLM com base na volatilidade do conhecimento embarcado e no custo do token.
- **Nunca** cacheie respostas de LLM com `temperature > 0` esperando reuso semântico — saída não é determinística.
- **Nunca** cacheie respostas que contêm dados específicos do usuário em namespace global.
- **Nunca** sirva resposta cacheada de LLM sem registrar que veio do cache (necessário para auditoria e métricas de custo).

## Dados sensíveis

- **Nunca** cacheie tokens, secrets, senhas, chaves de API, JWTs ou refresh tokens em qualquer camada de cache.
- **Nunca** cacheie respostas com PII em cache compartilhado ou CDN sem cifragem em repouso e controle de escopo.
- **Nunca** cacheie resposta de endpoint de autorização (`/me`, `/permissions`) com TTL longo — autorização revogada deve refletir rapidamente.
- **Sempre** cifre dados sensíveis cacheados em distributed cache quando o backing store não oferece cifragem nativa.

## Observabilidade

- **Sempre** instrumente hit rate, miss rate, eviction rate e latência por namespace de cache. Ver `@.contexts/engineering/rules/observability.md`.
- **Sempre** alerte quando hit rate cai abaixo do baseline esperado para um namespace.
- **Sempre** registre origem da resposta (cache hit, cache miss, stale-while-revalidate) em log estruturado.
- **Nunca** opere cache em produção sem métricas de hit rate. Cache sem observabilidade é dívida invisível.

## Warmup e cold start

- **Sempre** warme cache de dados críticos no startup ou em deploy quando o cold start degrada SLO.
- **Sempre** warme cache de forma assíncrona — startup não deve bloquear no warmup.
- **Nunca** dependa de warmup para correção; cache é otimização, não fonte de verdade.

## Anti-patterns proibidos

- Cachear input do usuário sem hashing ou validação prévia.
- Cache compartilhado servindo dados de tenants distintos pela mesma chave.
- TTL infinito sem invalidação por evento.
- Cache no client (localStorage, IndexedDB) com tokens, secrets ou PII.
- Cachear resultado de query SQL paginada usando offset como chave (chaves explodem; cursor é mais estável).
- Cachear respostas de erro transitórias (5xx) com o mesmo TTL de respostas bem-sucedidas.
- Invalidação por "limpar tudo" em produção — destrói hit rate e provoca stampede.
- Usar cache como fila ou store primário.
- Compor chave com objeto serializado por `JSON.stringify` sem ordenação determinística de campos.
- Cachear no servidor resposta que já é cacheável por CDN — duplica trabalho e dilui invalidação.

## Exemplos

**Errado:**
```ts
const key = `user-${email}-profile`;
cache.set(key, profile);
```

**Certo:**
```ts
const key = `users:v3:profile:${userId}`;
cache.set(key, profile, { ttlSeconds: 300 });
```

**Errado:**
```ts
const key = `llm:${prompt}`;
cache.set(key, completion);
```

**Certo:**
```ts
const promptHash = sha256(normalize(prompt));
const key = `llm:v1:${model}:${temperature}:${promptHash}`;
cache.set(key, completion, { ttlSeconds: 86400 });
```

**Errado:**
```http
Cache-Control: no-cache
```

**Certo (resposta pública estável):**
```http
Cache-Control: public, max-age=300, stale-while-revalidate=60
Vary: Accept-Encoding
ETag: "a3f5c9"
```

**Certo (resposta autenticada):**
```http
Cache-Control: private, max-age=60
Vary: Authorization
```
