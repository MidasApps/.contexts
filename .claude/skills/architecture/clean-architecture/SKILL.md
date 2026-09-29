---
name: clean-architecture
description: Use ao separar camadas com dependency rule (entities, use cases, interface adapters, frameworks). Keywords: clean architecture, use case.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
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
- Variante de hexagonal com camadas explícitas. Layout: `src/services/<context>/`, superset opcional da árvore de referência (`feature-based.md`); a feature escolhe hexagonal OU clean.

## Procedimento mínimo
1. Modelar entidades (sem framework).
2. Para cada ação do sistema, criar **use case** com schemas Zod `<UseCase>InputSchema`/`<UseCase>OutputSchema` em `dto/<use-case>.schema.ts` (tipos via `z.infer`).
3. Controller (HTTP/CLI) recebe request → monta input DTO → chama use case → presenter formata output.
4. Ports (`type`) em `application/ports/{input,output}/`, sem nome de tecnologia; implementações em `adapters/gateways/` com a tecnologia no nome (constante camelCase, ex. `postgresOrderRepository`).
5. Injeção de dependência no composition root.

## Anti-patterns
- Use case retornando entidade ORM → vaza framework; use DTO.
- Entidade importando logger/http → mover para use case ou adapter.
- Controller com lógica de negócio → mover para use case.

## Mini-exemplo
```ts
// application/dto/register-user.schema.ts (arquivos em kebab-case)
export const RegisterUserInputSchema = z.strictObject({ email: z.email(), password: z.string().min(12) });
export type RegisterUserInput = z.infer<typeof RegisterUserInputSchema>;
export const RegisterUserOutputSchema = z.strictObject({ userId: z.string().min(1).brand<"UserId">() }); // ID automático do Firestore
export type RegisterUserOutput = z.infer<typeof RegisterUserOutputSchema>;

// application/ports/input/register-user.ts — input boundary é um type
export type RegisterUser = (request: RegisterUserInput) => Promise<RegisterUserOutput>;

// application/use-cases/register-user.ts — interactor = factory; UserRepository/PasswordHasher são types em ports/output
export const makeRegisterUser = (deps: { users: UserRepository; hasher: PasswordHasher }): RegisterUser =>
  async (request) => { /*...*/ };
// adapters/controllers/register-user-route-handler.ts → safeParse(request) → 400 com envelope; chama registerUser
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/architecture/clean-architecture.md`
