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
- Variante de hexagonal com camadas explícitas.

## Procedimento mínimo
1. Modelar entidades (sem framework).
2. Para cada ação do sistema, criar **use case** com input/output DTOs.
3. Controller (HTTP/CLI) recebe request → monta input DTO → chama use case → presenter formata output.
4. Gateways (interfaces) declaradas no use-case layer; implementações em adapter.
5. Injeção de dependência no composition root.

## Anti-patterns
- Use case retornando entidade ORM → vaza framework; use DTO.
- Entidade importando logger/http → mover para use case ou adapter.
- Controller com lógica de negócio → mover para use case.

## Mini-exemplo
```ts
// use-cases/RegisterUser.ts
export interface RegisterUserInput { email: string; password: string }
export interface RegisterUserOutput { userId: string }
export class RegisterUser {
  constructor(private users: UserGateway, private hasher: Hasher) {}
  async exec(i: RegisterUserInput): Promise<RegisterUserOutput> { /*...*/ }
}
// adapters/http/UserController.ts → chama RegisterUser
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/architecture/clean-architecture.md`
