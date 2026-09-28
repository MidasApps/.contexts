# Migration — regra sempre-ativa

Mudanças de schema (DB, evento, API) são feitas em passos aditivos + backfill + dual-read antes de remover o antigo. Cada passo é deployável e reversível.

## Princípios
- **Expand → migrate → contract**: adicionar nova forma, mover dados/leitura, só então remover a antiga.
- Nunca um deploy quebra app em runtime — código novo lê forma velha E nova durante a transição.
- Backfill é idempotente, batched, com checkpoint — pode parar e retomar.
- `schemaVersion`/`version` em payloads de evento e documentos quando o formato evolui.
- Rollback path documentado **antes** do deploy: como voltar sem perder dados criados no meio.
- Migrações de DB são forward-only no histórico, mas cada uma tem plano de undo descrito.
- Sem `ALTER TABLE` em coluna grande sem janela ou online-schema-change (lock).

## Checklist (aplicar a todo turn)
- [ ] PR descreve fase: expand / migrate / contract.
- [ ] Código novo tolera dados antigos (e vice-versa durante expand).
- [ ] Backfill script é idempotente (re-execução é safe).
- [ ] Plano de rollback escrito no PR.
- [ ] Sem DROP/RENAME/NOT NULL em uma migração que ainda tem leitor antigo vivo.
- [ ] Index criado com `CONCURRENTLY` (Postgres) ou equivalente.

## Anti-patterns
- Renomear coluna em um passo → adicionar nova + dual-write + backfill + dropar antiga.
- `NOT NULL` sem default em tabela com dados → adicionar nullable, backfill, depois `NOT NULL`.
- Migrar produção sem dry-run em staging → sempre validar tempo e locks em staging.
- Quebrar evento existente → publicar v2 e manter v1 até consumidores migrarem.

## Mini-exemplo
```sql
-- expand
ALTER TABLE orders ADD COLUMN customer_uuid uuid;
-- migrate (backfill em batches)
UPDATE orders SET customer_uuid = (SELECT uuid FROM customers WHERE id = orders.customer_id)
WHERE customer_uuid IS NULL AND id BETWEEN $1 AND $2;
-- contract (deploy separado)
ALTER TABLE orders DROP COLUMN customer_id;
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/migration.md`
