# Sprint 1.A — Acceptance smoke test

Pré-requisitos: Docker, pnpm, `.env.local` com `DATABASE_URL`.

## Passos

1. Subir Postgres local
   ```bash
   ./scripts/db-up.sh
   ```

2. Aplicar migrations
   ```bash
   pnpm migrate
   ```
   Esperado: `Tables: messages, threads, working_memory`.

3. Subir o app
   ```bash
   pnpm dev
   ```
   Abrir <http://localhost:3005>, autenticar, abrir Canvas Builder.

4. Conduzir 3 turnos no chat:
   - **Turno 1**: "Crie um dashboard de inadimplência por safra para OM."
   - **Turno 2**: "Adicione bloco de curva-S abaixo."
   - **Turno 3**: "Resuma as decisões tomadas até agora."

5. Validar persistência via psql:
   ```bash
   docker exec liquid-pg psql -U liquid -d liquid_memory -c \
     "SELECT id, client_id, created_at FROM threads ORDER BY created_at DESC LIMIT 1;"
   docker exec liquid-pg psql -U liquid -d liquid_memory -c \
     "SELECT resource_id, payload->>'briefing' FROM working_memory ORDER BY updated_at DESC LIMIT 1;"
   ```
   Esperado: 1 thread recente; `working_memory` com `briefing` populado.

## Critérios de aprovação

- [ ] Thread criada (1 row em `threads`)
- [ ] `working_memory` escrita após Turno 2 (1 row em `working_memory`)
- [ ] Turno 3 menciona o cliente OM sem ter sido repetido pelo usuário
- [ ] `pnpm build` passa
- [ ] `pnpm test` passa (todos os testes da Sprint 1.A verdes)
- [ ] Header `x-thread-id` presente nas respostas de `/api/canvas-chat` e `/api/chat` (verificar via DevTools Network)

## Encerrar

```bash
./scripts/db-down.sh
```

## Referências

- ADR-0004: [Cloud SQL + pgvector storage único](../../adrs/decisions/0004-cloud-sql-pgvector-storage-unico.md)
- ADR-0006: [Multi-tenancy strict isolation](../../adrs/decisions/0006-multi-tenancy-strict-isolation.md)
- Plano-fonte: `2026-05-04-sprint1-A-cloud-sql-working-memory.md` (mesma pasta)
