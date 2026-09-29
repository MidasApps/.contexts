# Regras de State Management

Regras imperativas e agnósticas de biblioteca para gerenciamento de estado no front-end. Aplicam-se a qualquer camada cliente do projeto. Para uso específico de bibliotecas, ver `@stacks/state/zustand@5`, `@stacks/frontend/react@19`, `@stacks/frontend/next@16`.

## 1. Categorização de estado

**Sempre classifique o estado em uma das sete categorias antes de decidir onde armazená-lo:**

| Categoria | Definição | Local canônico |
|---|---|---|
| Server state | Dados que vivem no servidor e são cacheados no cliente | Fetch layer / RSC / cache do framework |
| URL state | Estado compartilhável via link (filtros, paginação, tabs, IDs de recurso) | Query string / route params |
| Form state | Valores de inputs em edição | Form library / uncontrolled DOM |
| UI local | Estado de um único componente (hover, open, focus) | `useState` no componente |
| Client global | Estado de sessão compartilhado entre rotas sem origem no servidor | Store global cliente |
| Derived | Valor calculado a partir de outro estado | Computado inline ou memo |
| Ephemeral | Estado transitório de UI (animações, timers) | Ref ou state local |

- Nunca trate uma categoria como se fosse outra. Server state em store global é bug.
- Se você não consegue classificar um pedaço de estado em uma categoria, não armazene ainda — descubra a categoria primeiro.

## 2. Source of truth única

- **Cada pedaço de estado tem exatamente uma fonte de verdade.** Se aparece em dois lugares, um dos dois é derivado e deve ser computado, não armazenado.
- Nunca duplique server state dentro de uma store cliente. Use a fonte cacheada do fetch layer.
- Nunca copie props para state local "para ter cópia editável" — controle o input ou eleve o state.
- Quando precisar sincronizar dois sistemas, defina explicitamente quem é o owner e quem é o mirror, e documente no código.

## 3. Server state nunca vira client state

- Não copie resposta de fetch para Zustand, Context ou variável de módulo.
- Para dados que vêm do servidor, prefira Server Components. Quando precisar de interatividade, busque no servidor e passe como prop.
- Mutations no servidor invalidam o cache do fetch layer — não atualize manualmente uma store paralela.
- Cache de servidor (Next.js `fetch`, Server Actions revalidate) é o canal oficial. Não bypasse com store cliente.

## 4. Prefira estado derivado a estado armazenado

- Se um valor pode ser calculado a partir de outro estado, **compute, não armazene**.
- Não crie state para `isEmpty`, `hasItems`, `totalPrice`, `filteredList` quando a lista base já existe.
- Use memoização apenas quando o cálculo é caro e mensurado, não preventivamente.
- Anti-pattern proibido: `useEffect` que sincroniza um state com outro state. Substitua por derivação direta.

## 5. Escopo mínimo

- Mantenha o estado no escopo mais baixo possível. Eleve apenas quando dois ou mais componentes irmãos precisam ler ou escrever.
- Não promova para store global o que pode viver no componente.
- Não promova para Context o que pode viver em props.
- Quando elevar, eleve até o ancestral comum mais próximo, não até a raiz.

## 6. URL como estado compartilhável

- Filtros, paginação, abas selecionadas, ordenação, IDs de recurso em foco, modais com deep-link: **vão na URL**.
- Use query params para state não-hierárquico (filtros, busca). Use route segments para state hierárquico (recurso/subrecurso).
- Não duplique URL state em store cliente. Leia direto dos hooks de routing.
- Estado de UI puramente transitório (tooltip aberto, dropdown expandido) **não vai na URL**.

## 7. Imutabilidade

- Nunca mute estado existente. Sempre produza novo objeto/array.
- Arrays: `concat`, spread, `filter`, `map` — nunca `push`, `splice`, `sort` in-place sobre o state.
- Objetos: spread ou helpers de imutabilidade — nunca atribuição direta a propriedade do state.
- Quando aninhar profundamente, considere normalizar antes de aplicar imutabilidade manual.

## 8. Normalização de estado relacional

- Estado com entidades referenciando outras entidades deve ser normalizado: `{ byId: {...}, allIds: [...] }`.
- Não armazene listas duplicadas da mesma entidade em lugares diferentes da store.
- IDs são a chave de referência cruzada. Componentes leem por ID, não por objeto inteiro.
- Listas filtradas/ordenadas para exibição são derivadas, não armazenadas.

## 9. Context: use com parcimônia

- Context resolve prop drilling, não substitui store global.
- Context sem memoização do `value` causa re-render em cascata — sempre estabilize o objeto provido.
- Não coloque state que muda frequentemente em Context amplo. Divida em Contexts pequenos por frequência de mudança.
- Para state compartilhado entre rotas distantes, prefira store global em vez de Context na raiz.

## 10. Formulários

- Default: **uncontrolled**. Leia valores via `FormData` ou refs no submit.
- Use controlled apenas quando precisar reagir a cada keystroke (validação live, mascaramento, dependências entre campos).
- Não duplique valor de input em store global. Form state morre quando o form fecha.
- Submit prefere Server Actions sobre handlers cliente quando o destino é o servidor.
- Reset de form é responsabilidade do form, não da store de domínio.

## 11. Optimistic updates

- Aplique mutation otimista apenas quando a chance de falha é baixa e o usuário se beneficia da resposta imediata.
- **Sempre** implemente rollback explícito em caso de erro do servidor.
- Mantenha referência ao estado anterior antes de aplicar otimismo.
- Em caso de erro, restaure o estado anterior e exiba feedback do erro — nunca deixe UI em estado inconsistente.
- Não acumule otimismos: se uma operação otimista falha, descarte otimismos subsequentes dependentes.

## 12. Race conditions e cancelamento

- Toda operação assíncrona que pode ser disparada novamente antes de completar precisa de cancelamento ou de descarte de resultado stale.
- Use `AbortController` para fetches canceláveis.
- Quando cancelamento não é possível, marque a requisição com um ID e descarte o resultado se o ID atual mudou.
- Em busca por digitação, debounce **e** cancele a requisição anterior — não apenas debounce.
- Nunca aplique resultado de requisição obsoleta ao state atual.

## 13. Streams e estado parcial

- Para respostas streamadas (AI SDKs, server-sent events), o state acumula chunks até completar.
- Mantenha flag explícita de status: `idle`, `streaming`, `done`, `error`. Não infira via comparação de strings.
- Cancele streams em desmonte do componente. Stream órfã é vazamento.
- Não persista stream parcial — só persista após `done`.

## 14. Persistência

- Persista apenas o que precisa sobreviver a reload: preferências do usuário, draft de form longo, carrinho.
- Não persista server state — ele já tem fonte canônica.
- Não persista state derivado.
- Sempre versione o shape do state persistido. Inclua migração quando o shape muda.
- Em SSR, evite hidratação que dependa de storage do browser — use placeholder e hidrate após mount, ou marque como client-only.

## 15. Reset e cleanup

- Toda store global precisa de método `reset` explícito.
- Reset acontece em logout, troca de tenant, ou ao sair de fluxo isolado.
- Limpe listeners, timers, subscriptions e abort controllers em desmonte de componente.
- State efêmero não deve sobreviver à navegação que o tornou irrelevante.

## 16. Debug

- Use DevTools da biblioteca de state (Redux DevTools, Zustand devtools middleware) apenas em desenvolvimento.
- Toda store global tem nome identificável no DevTools.
- Mutations devem ter nomes descritivos (`setUser`, não `set1`).
- Não exponha DevTools em produção.

## 17. Anti-patterns proibidos

- Sincronizar dois states via `useEffect` quando um pode ser derivado do outro.
- Mega-store global única contendo todo o estado da aplicação. Divida por domínio.
- Context com valor não-memoizado em árvore profunda.
- `useState` inicializado com prop e nunca sincronizado — leve o controle para o pai.
- Mutar diretamente: `state.items.push(x)`, `user.name = 'x'`.
- Server state cacheado em store cliente "para evitar refetch" — use o cache do fetch layer.
- Derivar via `useEffect` + `setState`: substitua por cálculo inline.
- Store global usada para passar dados entre componentes que poderiam usar props ou Context local.
- Persistir tudo "por garantia" em localStorage.
- Boolean flags acumulados (`isLoading`, `isError`, `isSuccess`) — use uma máquina de estados ou enum único.

## 18. Critério de decisão (árvore mínima)

Ao introduzir novo state, responda em ordem:

1. Pode ser derivado de state existente? → derive, não armazene.
2. Vem do servidor? → fetch layer / RSC, não store.
3. É compartilhável por link? → URL.
4. É valor de input em edição? → form state.
5. É usado por um único componente? → `useState` local.
6. É usado por componentes vizinhos? → eleve ao ancestral comum.
7. É usado em rotas distantes e não vem do servidor? → store global.
8. Em qualquer outro caso → pare e reclassifique.

## Referências cruzadas

- Validação de inputs em formulários: `@rules/validation`
- Custo de re-renders e memoização: `@rules/performance`
- Implementação concreta com Zustand: `@stacks/state/zustand@5`
- React 19 (`use`, `useOptimistic`, `useTransition`, `useActionState`): `@stacks/frontend/react@19`
- Server Components, Server Actions, cache do fetch: `@stacks/frontend/next@16`
