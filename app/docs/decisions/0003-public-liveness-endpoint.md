# 0003. `GET /v1/health` is a public liveness endpoint

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/` (local decision of the boilerplate; the framework in `.contexts/` is unchanged)
- **Deviates from:** spec §16.2 ("`/v1` accepts only `Authorization: Bearer`"), for this one route

## Context

Load balancers, uptime checks and the hosting platform (App Hosting or Cloud Run) probe the app without user credentials. `rules/observability.md` (Health checks) separates liveness ("should the process be restarted?") from readiness ("can it take traffic?"). It also requires that a health check never leak versions, configuration or counts without authentication.

## Decision

`GET /v1/health` is public and is liveness only:

- it accepts **GET only**; other methods get the framework's 405;
- it returns a **fixed body** `{"data":{"status":"ok"}}` with 200, plus `x-request-id` and `cache-control: no-store`;
- it performs no dependency checks, and exposes no version, build id, config, env name or counts;
- the only logic is the shared route boundary: request-id resolution, one structured log line, and a generic 500 envelope.

The driving adapter is `@core/services/platform/health-route-handler`.

## Consequences and follow-ups

- **Readiness** will be a separate endpoint that checks Postgres, Firestore and Mastra. It will be authenticated or internal-only (IAM, or not routed publicly), never merged into this route.
- **Rate limiting** for this route belongs at the edge (Cloud Armor, LB or CDN), not in the app, so the probe stays cheap.
- **CORS** is not enabled here. If the desktop app needs to call it cross-origin, it gets an explicit origin allowlist, never `Access-Control-Allow-Origin: *`.
- Every other `/v1` route keeps the Bearer-only rule of spec §16.2.
