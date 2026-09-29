---
name: clean-architecture
description: "Use ao separar camadas com dependency rule (entities, use cases, interface adapters, frameworks). Keywords: clean architecture, use case."
---
# Clean Architecture

Quatro círculos concêntricos com **dependency rule**: dependências apontam só para dentro. Cada camada conhece apenas as mais internas.

## Essência
- **Entities (centro):** regras de negócio enterprise — válidas em qualquer aplicação.
- **Use cases:** regras de aplicação — orquestram entidades para atender ação específica.
- **Interface adapters:** controllers, presenters, gateways — convertem dados entre use case e mundo externo.
- **Frameworks/drivers (externo):** web, DB, UI, dispositivos.
- **Dependency rule:** sempre aponta pra dentro. Use case **não conhece** controller; entidade **não conhece** use case.
- **DTOs/boundaries:** entrada e saída de use case são dados simples — não tipos de framework.
- Variante de hexagonal com camadas explícitas. Layout: `src/services/<context>/`, mesma árvore de referência (`feature-based.md`, ADR 0003 Amendments): `application/use-cases/`, `application/ports/{driving,driven}/`, `adapters/{driving,driven}/`.

## Procedimento mínimo
1. Modelar entidades (sem framework).
2. Para cada ação do sistema, criar **use case** com schemas Zod `<UseCase>InputSchema`/`<UseCase>OutputSchema` em `application/use-cases/<use-case>.schema.ts` (tipos via `z.infer`).
3. Controller (HTTP/CLI, em `adapters/driving/`) recebe request → monta input DTO → chama use case → presenter formata output.
4. Ports (`type`) em `application/ports/driving/` (input boundary) e `application/ports/driven/` (output boundary), sem nome de tecnologia; gateways em `adapters/driven/` com a tecnologia no nome (constante camelCase, ex. `postgresOrderRepository`).
5. Injeção de dependência no composition root.

## Anti-patterns
- Use case retornando entidade ORM → vaza framework; use DTO.
- Entidade importando logger/http → mover para use case ou adapter.
- Controller com lógica de negócio → mover para use case.

## Mini-exemplo
```ts
// application/use-cases/register-user.schema.ts (arquivos em kebab-case)
export const RegisterUserInputSchema = z.strictObject({ email: z.email(), password: z.string().min(12) });
export type RegisterUserInput = z.infer<typeof RegisterUserInputSchema>;
export const RegisterUserOutputSchema = z.strictObject({ userId: z.string().min(1).brand<"UserId">() }); // ID automático do Firestore
export type RegisterUserOutput = z.infer<typeof RegisterUserOutputSchema>;

// application/ports/driving/register-user.ts — input boundary é um type
export type RegisterUser = (request: RegisterUserInput) => Promise<RegisterUserOutput>;

// application/use-cases/register-user.ts — interactor = factory; UserRepository/PasswordHasher são types em ports/driven
export const makeRegisterUser = (deps: { users: UserRepository; hasher: PasswordHasher }): RegisterUser =>
  async (request) => { /*...*/ };
// adapters/driving/register-user-route-handler.ts → safeParse(request) → 400 com envelope; chama registerUser
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/architecture/clean-architecture.md`
