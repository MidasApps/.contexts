---
title: Regras de Modelagem de Dados
type: rules
scope: engineering
status: active
last_updated: 2026-07-13
related:
  - "@.contexts/engineering/rules/development.md"
  - "@.contexts/engineering/rules/validation.md"
  - "@.contexts/engineering/rules/security.md"
  - "@.contexts/engineering/architecture/ddd.md"
  - "@.contexts/engineering/contracts/schemas.md"
  - "@.contexts/engineering/contracts/firebase-firestore.md"
  - "@.contexts/engineering/contracts/postgres.md"
  - "@.contexts/engineering/contracts/bigquery.md"
  - "@.contexts/engineering/contracts/pgvector.md"
  - "@.contexts/engineering/contracts/events.md"
---

# Regras de Modelagem de Dados

Regras imperativas e agnósticas de tecnologia sobre como modelar dados no domínio do sistema. Cobrem distinção entre entidades e value objects, identificadores, normalização versus desnormalização, invariantes, tipos fortes, nullability, timestamps, soft delete, evolução de schema, enums, valores monetários, relacionamentos, dados derivados, versionamento, eventos versus estado, modelagem de tempo, PII e agregados. Para convenções específicas de cada banco, ver os documentos em Contracts. Para regras de validação em boundary, ver `@.contexts/engineering/rules/validation.md`. Para o modelo arquitetural de DDD adotado, ver `@.contexts/engineering/architecture/ddd.md`. Para regras de migração de schema, ver `@.contexts/engineering/rules/migration.md`.

## Escopo

Aplica-se a toda modelagem de dados persistidos ou trafegados entre componentes do sistema, independentemente da tecnologia de armazenamento (Firestore, PostgreSQL, pgvector, BigQuery, eventos, cache). Define princípios universais que precedem as convenções específicas de cada store. Não cobre convenções de naming de coleções, tabelas ou campos por tecnologia (ver Contracts), nem regras de validação em fronteiras de entrada (ver `@.contexts/engineering/rules/validation.md`), nem manual de uso de ferramentas específicas (ver Stacks).

---

## 1. Entidades versus value objects

- **Sempre** distinga entidade (tem identidade própria persistente) de value object (definido inteiramente pelos seus atributos). Modelar todo dado como entidade é desperdício; modelar tudo como value object perde rastreabilidade.
- **Sempre** dê identidade própria a qualquer coisa com ciclo de vida — usuário, organização, pedido, sessão, documento.
- **Nunca** dê identidade própria a conceitos descritivos sem ciclo de vida — endereço, dinheiro, range de datas, coordenada, cor. Esses são value objects.
- **Sempre** trate value objects como imutáveis. Mudar um value object significa substituí-lo, não mutá-lo.
- **Nunca** compare entidades por valor. Duas entidades são iguais se e somente se têm o mesmo identificador.
- **Sempre** compare value objects por valor. Dois value objects com os mesmos atributos são o mesmo valor.
- **Nunca** persista um value object com chave primária artificial só porque "facilita join". Se precisa de identidade, é entidade.

## 2. Identificadores

- **Sempre** gere identificadores opacos. O identificador não carrega significado de negócio, não revela ordem de criação para o usuário final, não embute tenant id, nem categoria.
- **Nunca** use auto-increment numérico como identificador de entidades expostas externamente. Vaza volume, é previsível, conflita em sistemas distribuídos.
- **Sempre** prefira **UUIDv7** (`uuidv7()` no Postgres 18) ou **ULID** quando a ordenação por tempo de criação for útil para indexação ou paginação. Em **Postgres**, default = `uuidv7()`; em **Firestore**/event IDs client-side, ULID continua o padrão textual.
- **Sempre** prefira UUID v4 quando ordenação temporal for indesejada por questões de privacidade ou enumeração (tokens públicos, identificadores expostos em URLs sensíveis).
- **Nunca** use UUID v1. Vaza MAC address e timestamp em formato decodificável.
- **Nunca** misture UUIDv7 e ULID como PK no mesmo bounded context sem ADR (ver `@contracts/postgres`).
- **Sempre** gere o identificador no domínio antes de persistir. O cliente não depende do banco para conhecer o ID do recurso que acabou de criar.
- **Nunca** mude o identificador de uma entidade depois que ela existe. Identidade é imutável; mudou, é outra entidade.
- **Sempre** trate o identificador como string opaca no código que não é o de geração. Não parseie, não extraia partes, não infira ordem.
- **Nunca** exponha identificadores internos (chaves primárias de banco) em APIs públicas se forem diferentes do identificador de domínio. Mantenha uma única identidade pública.
- **Sempre** prefixe o identificador com o tipo da entidade quando trafegado em logs e APIs (`user_01H...`, `order_01H...`) para legibilidade e roteamento. Decida o esquema uma vez e mantenha consistente.

## 3. Tipos fortes e branded types

- **Sempre** branded types em TypeScript para identificadores. `UserId` e `OrderId` não devem ser intercambiáveis só porque ambos são `string`.
- **Nunca** passe `string` cru como parâmetro de função quando o domínio espera um identificador específico. O compilador deve recusar `findOrder(userId)`.
- **Sempre** branded types para valores escalares com unidade ou regra (`Email`, `Slug`, `IsoDateString`, `PositiveInt`, `Cents`). O tipo carrega o invariante.
- **Nunca** crie um branded type sem um construtor que valide. Branded sem validação é falso conforto.
- **Sempre** construa branded types em um único lugar (factory ou schema). Quem recebe o tipo confia que a invariante já foi verificada.
- **Nunca** faça cast direto (`as UserId`) para criar um branded type fora da factory. Cast burla o invariante.

## 4. Nullability explícita

- **Sempre** torne nullability uma decisão consciente em cada campo. `null` significa "ausente por design"; ausência de campo significa "não definido neste momento".
- **Nunca** use string vazia como sinal de "ausente". `""` é um valor válido de string. Use `null` ou omita o campo.
- **Nunca** use `0`, `-1` ou `9999-12-31` como sinal de "não definido". Sentinelas mágicas envenenam queries e agregações.
- **Sempre** documente o significado semântico de `null` em campos que o aceitam. `deletedAt: null` significa "não deletado"; `phoneNumber: null` significa "usuário não informou".
- **Nunca** misture `null` e `undefined` no mesmo campo. Decida um e mantenha. Em TypeScript de domínio, prefira `null` para "ausente persistido" e reserve `undefined` para "não carregado ainda".
- **Sempre** torne campos obrigatórios não-nullable por default. Permissividade é decisão explícita.
- **Nunca** adicione um campo nullable só "para casos futuros". Adicione quando o caso existir; campos opcionais sem uso real degradam o modelo.

## 5. Normalização versus desnormalização

- **Sempre** normalize por padrão. Cada fato vive em um único lugar; mudanças propagam por referência.
- **Nunca** desnormalize sem motivo declarado e mensurável (latência de leitura específica, custo de join inviável, requisito de imutabilidade histórica).
- **Sempre** desnormalize em três casos legítimos: latência de leitura em store sem joins (Firestore, DynamoDB), snapshot histórico imutável (linha do pedido preserva o preço do produto no momento da compra), agregação pré-computada para analytics.
- **Nunca** desnormalize dado que precisa permanecer consistente com sua fonte. Se o nome do usuário mudou e o pedido ainda mostra o antigo sem essa ser a intenção, a desnormalização está errada.
- **Sempre** declare explicitamente quando um campo desnormalizado é snapshot (imutável após gravado) versus cache (deve ser atualizado quando a fonte muda). São duas estratégias diferentes e não podem ser confundidas.
- **Nunca** desnormalize "para o caso de precisar". Espere o requisito, meça, então desnormalize.

## 6. Invariantes no modelo

- **Sempre** codifique invariantes no tipo ou no construtor, não em validações espalhadas. Se `Order` exige pelo menos um item, não permita construir `Order` sem itens.
- **Nunca** dependa exclusivamente de validação em camada de aplicação para invariantes estruturais do domínio. Validação na borda complementa; o tipo previne.
- **Sempre** prefira "make illegal states unrepresentable". Use union types discriminados para representar estados mutuamente exclusivos em vez de booleans soltos.
- **Nunca** modele com `status: string + completedAt: Date | null + cancelledAt: Date | null + refundedAt: Date | null` quando apenas um pode existir por vez. Use union discriminada.
- **Sempre** declare invariantes que cruzam campos como métodos do agregado, não como validações de campo isolado. "Data de fim deve ser após data de início" pertence ao agregado.

## 7. Timestamps e tempo

- **Sempre** armazene timestamps em UTC. Sem exceção. Conversão para fuso local é responsabilidade da camada de apresentação.
- **Nunca** armazene timestamps em fuso local. Horário de verão, mudanças de regulamentação e usuários em fusos diferentes destroem o dado.
- **Sempre** use ISO 8601 com timezone explícito ao trafegar timestamps como string (`2026-05-20T14:32:00.000Z`).
- **Nunca** trafegue timestamps como número opaco (epoch sem unidade) entre serviços sem documentar unidade. Segundos ou milissegundos? Documente ou use ISO 8601.
- **Sempre** inclua campos de auditoria em toda entidade persistida: `createdAt` (imutável, gravado uma vez), `updatedAt` (atualizado a cada mutação).
- **Nunca** permita mutação de `createdAt`. É histórico, não estado.
- **Sempre** atualize `updatedAt` automaticamente na camada de persistência (trigger, middleware, hook), não confie no caller.
- **Nunca** confunda tempo de evento (`occurredAt`) com tempo de registro (`createdAt`). Para eventos de domínio capturados retroativamente, ambos existem e diferem.
- **Sempre** modele intervalos de tempo como `[startAt, endAt)` (início inclusivo, fim exclusivo) por padrão. Mantém consistência em queries e agregações.
- **Nunca** modele "duração" como `startAt` e `durationMinutes`. Calcule sob demanda ou armazene `endAt` explicitamente; campos derivados redundantes divergem.

## 8. Soft delete versus hard delete

- **Sempre** decida explicitamente por entidade se o delete é soft ou hard. Não é decisão default.
- **Sempre** use soft delete (`deletedAt: timestamp | null`) quando: histórico é requisito legal, recuperação é possibilidade legítima, integridade referencial impede delete em cascata, auditoria depende do registro.
- **Sempre** use hard delete quando: o dado é PII e o usuário pediu remoção (GDPR, LGPD), o dado é puramente operacional e descartável (sessões expiradas, locks), o custo de armazenamento e ruído em queries supera o valor histórico.
- **Nunca** misture soft e hard delete na mesma coleção sem declarar a estratégia. O leitor não pode adivinhar.
- **Sempre** filtre `deletedAt IS NULL` por padrão em queries de leitura quando soft delete é aplicado. Não delegue ao caller lembrar.
- **Nunca** mude um soft-deleted para ativo de novo sem campo explícito (`restoredAt` ou `deletedAt = null` com motivo registrado em audit log).
- **Sempre** trate o registro soft-deleted como invisível para o domínio. Ele existe para auditoria, não para lógica de negócio.

## 9. Enums e enumerados

- **Sempre** prefira enums fechados (lista finita, conhecida em design time) quando o domínio modela um conjunto natural e estável de estados (`OrderStatus: 'pending' | 'paid' | 'shipped' | 'cancelled'`).
- **Nunca** use enums numéricos em persistência. O significado de `2` muda quando alguém reordena. Use strings semânticas.
- **Sempre** armazene enums como strings legíveis (`'pending'`), não como inteiros opacos.
- **Nunca** reutilize um valor de enum aposentado para significar outra coisa. Adicione um novo valor; o antigo permanece com seu significado histórico.
- **Sempre** trate enums como abertos (string aceitando valores futuros) quando a lista cresce sem versionamento (categorias de produto, países, moedas). Trate como fechados (union literal) quando a lista é parte da lógica de negócio.
- **Nunca** mate o build de produção quando um valor desconhecido chega em campo modelado como enum aberto. Modele um caso `unknown` ou faça parse tolerante na borda.

## 10. Money e valores decimais

- **Nunca** armazene dinheiro como float. Nunca. Float perde precisão em soma e comparação.
- **Sempre** armazene dinheiro como inteiro na menor unidade da moeda (centavos para BRL e USD, yen como inteiro para JPY).
- **Sempre** modele dinheiro como value object com `amount: integer + currency: string`. Valor sem moeda é incompleto.
- **Nunca** some valores em moedas diferentes sem conversão explícita. Operação aritmética entre `BRL` e `USD` deve falhar em tipo, não em runtime.
- **Sempre** use bibliotecas dedicadas para decimais quando inteiros não bastam (medidas científicas, taxas de câmbio, percentuais com muitas casas). Nunca confie em `Number` puro.
- **Nunca** armazene preço como string formatada (`"R$ 19,90"`). Formato é apresentação; armazene o número.

## 11. Relacionamentos e cardinalidades

- **Sempre** modele cardinalidade explicitamente (1:1, 1:N, N:N) com base no domínio, não na conveniência de query.
- **Nunca** modele N:N achatando em array de IDs em um lado quando o relacionamento tem atributos próprios. Se a relação tem `createdAt` ou `role`, ela é uma entidade.
- **Sempre** prefira referência por ID a embed quando a entidade referenciada tem ciclo de vida próprio. `Order.userId` referencia, não embeda `User`.
- **Sempre** prefira embed a referência quando o dado é value object inseparável (endereço de entrega dentro do pedido) ou snapshot histórico (preço no momento da compra).
- **Nunca** crie referências circulares persistidas. Se `A` aponta para `B` e `B` aponta para `A`, mantenha apenas uma direção como fonte da verdade.
- **Sempre** decida e documente quem é dono do relacionamento. Em N:N, a tabela ou coleção de junção é a fonte; os dois lados nunca duplicam a verdade.

## 12. Dados derivados e computados

- **Nunca** persista dado derivado que pode ser calculado em runtime com custo aceitável. `fullName` derivado de `firstName + lastName` não é persistido.
- **Sempre** persista dado derivado apenas quando: o cálculo é caro, o histórico do valor importa (snapshot), ou o índice depende do campo.
- **Sempre** marque campos derivados persistidos com nome que indique sua natureza (`computedTotalCents`, `denormalizedUserName`) quando a distinção for útil para o leitor.
- **Nunca** permita escrita direta em campo derivado fora do mecanismo que o computa. Trigger, função, ou camada de domínio é a única origem.
- **Sempre** declare a estratégia de recomputação: síncrono na escrita, assíncrono via evento, batch periódico. Dado derivado sem estratégia de atualização degrada silenciosamente.

## 13. Eventos versus estado

- **Sempre** distinga modelagem de estado (snapshot atual) de modelagem de evento (fato ocorrido). São conceitos diferentes com regras diferentes.
- **Sempre** trate eventos como imutáveis. Um evento gravado nunca é alterado; correções são novos eventos.
- **Nunca** delete eventos. Eventos são histórico; soft delete não se aplica a eventos.
- **Sempre** inclua em todo evento: identificador único, tipo, timestamp de ocorrência, identificador do agregado de origem, versão do schema do evento, payload.
- **Nunca** reutilize o mesmo tipo de evento para significar coisas diferentes em contextos diferentes. `UserUpdated` é vago; prefira `UserEmailChanged`, `UserRoleAssigned`.
- **Sempre** versione o schema de eventos. Eventos vivem para sempre; consumidores antigos precisam continuar lendo.
- **Nunca** quebre o schema de um evento já publicado em produção. Adicione novo tipo ou nova versão; o antigo permanece legível.

## 14. Evolução de schema

- **Sempre** evolua schemas de forma aditiva. Adicionar campo opcional é seguro; remover campo, renomear ou mudar tipo não é.
- **Nunca** mude o tipo de um campo existente. Crie um novo campo com o novo tipo, migre, depois aposente o antigo em release subsequente.
- **Nunca** renomeie um campo persistido sem migração explícita. Renomear no código quebra leitura de dados antigos.
- **Sempre** mantenha campos aposentados legíveis por pelo menos um ciclo de release após sua substituição. Backwards compatibility custa pouco e evita corridas.
- **Sempre** marque campos deprecados com comentário e data planejada de remoção. "Deprecated forever" vira "campo zumbi" e ninguém remove.
- **Nunca** dependa de dados migrarem instantaneamente. Sempre exista um período onde o schema antigo e o novo coexistem; código deve ler ambos.
- **Sempre** trate adição de campo obrigatório a tabela existente como migração de dados, não apenas de schema. Sem default semântico, dados antigos ficam inválidos.

## 15. PII e classificação de dados

- **Sempre** classifique cada campo de cada entidade quanto à sensibilidade: público, interno, restrito, PII, sensível (saúde, financeiro, infantil).
- **Sempre** modele PII em campos isoláveis. Se o registro inteiro é PII, todo o registro é PII; se apenas email e telefone são, modele com clareza para permitir minimização.
- **Nunca** misture PII no meio de campos operacionais sem rotulação. Auditoria e remoção dependem de saber onde está.
- **Sempre** modele consentimento como dado de primeira classe quando aplicável (`marketingConsentAt: timestamp | null`, `dataProcessingConsentVersion: string`).
- **Nunca** armazene PII em logs, mensagens de erro persistidas, ou campos de texto livre destinados a debug. PII em log foge da política de retenção.
- **Sempre** considere a estratégia de remoção desde o desenho. Se PII será apagada por LGPD/GDPR, o modelo precisa permitir remoção sem quebrar integridade referencial (anonimização, tombstone, hard delete planejado).

## 16. Agregados e consistência

- **Sempre** delimite agregados (no sentido DDD): conjunto de entidades modificadas juntas atomicamente, com uma raiz que é o único ponto de acesso externo.
- **Nunca** modifique entidades internas de um agregado de fora da raiz. Toda mutação passa pela raiz; ela é guardiã das invariantes.
- **Sempre** mantenha agregados pequenos. Agregado grande sofre contenção em escrita concorrente e tende a violar invariantes por escopo.
- **Nunca** referencie outra entidade interna de outro agregado. Referencie a raiz do outro agregado por ID.
- **Sempre** torne consistência entre agregados eventual, não transacional. Forte consistência transacional vive dentro do agregado; entre agregados, use eventos ou processos de reconciliação.
- **Nunca** envolva múltiplos agregados em uma transação distribuída para forçar consistência forte. Replanteje o limite do agregado.

## 17. Versionamento de registros

- **Sempre** decida explicitamente se uma entidade precisa de histórico de versões. Não é padrão; é decisão.
- **Sempre** modele versionamento como tabela ou coleção separada de versões (`document_versions`, `policy_revisions`) quando o histórico é parte do domínio (contratos, políticas, conteúdo editorial).
- **Nunca** sobrescreva versões antigas em-place quando o histórico tem valor de auditoria ou legal.
- **Sempre** identifique cada versão por `version: integer` monotônico ou `versionId: opaque`, e mantenha referência à versão anterior se a cadeia importar.
- **Nunca** confie em `updatedAt` como mecanismo de versionamento. Timestamp é metadado; versão é entidade.

## 18. Modelagem de localização e dimensões

- **Sempre** modele coordenadas geográficas como par latitude/longitude com WGS84 explícito. Outros sistemas existem e divergem.
- **Sempre** armazene endereços estruturados (campos separados: street, city, region, postalCode, country) em vez de texto livre, exceto quando o domínio explicitamente trata endereço como string opaca (notas de entrega).
- **Nunca** armazene país, idioma, ou moeda como nome por extenso. Use códigos ISO (ISO 3166-1 alpha-2 para país, ISO 639-1 para idioma, ISO 4217 para moeda).
- **Sempre** trate locale como dado de primeira classe quando o domínio é internacional. `locale: 'pt-BR'` é fonte da verdade para formatação; não infira da geografia.

## 19. Anti-patterns proibidos

- **Nunca** modele com EAV (Entity-Attribute-Value) genérico só para "permitir campos dinâmicos". Sacrifica integridade, performance e legibilidade. Se há campos verdadeiramente dinâmicos, isole-os em coluna JSON tipada por contexto.
- **Nunca** use colunas booleanas múltiplas para representar estado mutuamente exclusivo (`isActive`, `isPending`, `isCancelled`). Use enum único.
- **Nunca** modele relacionamento como string concatenada (`"user_123:role_admin"`). Use campos estruturados.
- **Nunca** persista dado serializado opaco (blob JSON sem schema) quando o conteúdo é consultado ou validado. JSON é último recurso para dados verdadeiramente livres.
- **Nunca** crie tabela ou coleção "miscellaneous" para dados que não souberam onde colocar. Modele ou descarte.
- **Nunca** modele com "campo livre para o futuro" (`extra1`, `extra2`, `customField`). Adicione campo nomeado quando o requisito existir.

## 20. Decisões cruzadas

- **Sempre** registre como ADR qualquer decisão de modelagem que: introduz desnormalização, escolhe soft delete para entidade central, define estratégia de versionamento, classifica PII, ou define formato de identificador. Ver `@.contexts/engineering/decisions/`.
- **Sempre** consulte as convenções específicas do store em Contracts antes de aplicar essas regras a Firestore, PostgreSQL, BigQuery ou pgvector. Esses documentos refinam, não contradizem.
- **Nunca** trate essas regras como substitutas das convenções de schema em `@.contexts/engineering/contracts/schemas.md`. Estas regras governam o que modelar; aquele documento governa como nomear e estruturar.
