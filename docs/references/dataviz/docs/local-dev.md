# Local Dev — Memory Service

> ⛔ **OBSOLETO — NÃO SIGA ESTE ARQUIVO.** Ele manda subir Postgres/pgvector,
> descontinuado pela **ADR-0013** (storage canônico é Firestore). Os comandos
> abaixo não existem mais: `scripts/db-up.sh`, `scripts/db-down.sh` e
> `pnpm migrate` foram removidos.
>
> **Para rodar local hoje:** `pnpm dev` (porta 3005) ou, para produção local,
> `docker compose --env-file .env.local up --build -d`. Credenciais e variáveis
> em `.env.example` / `.env.docker.example`. Visão geral em `CLAUDE.md`.
>
> Mantido só como registro histórico da decisão anterior.

Decisão arquitetural (superseded): [`adrs/decisions/0004-cloud-sql-pgvector-storage-unico.md`](../adrs/decisions/0004-cloud-sql-pgvector-storage-unico.md).

## Pré-requisitos
- Docker
- pnpm 10.32.1

## Subir Postgres local
```bash
./scripts/db-up.sh
```
Conexão: `postgresql://liquid:liquid@localhost:5433/liquid_memory`.

## Rodar migrations
```bash
pnpm migrate   # disponível após Sprint 1.A Task 3
```

## Encerrar
```bash
./scripts/db-down.sh
```
