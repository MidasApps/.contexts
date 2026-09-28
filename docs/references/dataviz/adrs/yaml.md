# YAML configuration schema for REST API orchestration in ETL pipelines

A YAML-based declarative configuration schema for REST API calls in ETL pipelines must address **11 interrelated domains**: HTTP semantics, authentication, client configuration patterns, pipeline orchestration, data transformation, observability, security, and more. This research compiles findings from HTTP RFCs, real-world API tools (Postman, Bruno, cURL), orchestration platforms (Airflow, Dagster, dlt), and Python library internals to inform a comprehensive Architecture Decision Record. The proposed schema draws on **RFC 9110–9114** for HTTP semantics, **RFC 6749/6750** for OAuth 2.0, **OpenTelemetry semantic conventions** for observability, and proven patterns from Docker Compose, Kubernetes, and GitHub Actions for YAML structure. Below is the complete reference material organized by domain.

---

## HTTP standards define the configuration surface area

RFC 9110 (June 2022) obsoletes RFCs 7230–7235 and serves as the modern foundation for HTTP semantics. The schema must support all **nine HTTP methods** — GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, TRACE, and CONNECT — with awareness of their safety and idempotency properties. Idempotent methods (GET, PUT, DELETE, HEAD) are safe to retry automatically; non-idempotent methods (POST, PATCH) require explicit idempotency keys.

**Content negotiation headers** form a critical configuration surface. The `Accept` header (application/json, application/xml, text/csv, application/graphql), `Content-Type` for request bodies, `Accept-Encoding` (gzip, deflate, br), and `Accept-Language` all need explicit configuration. Common MIME types for ETL pipelines include `application/json`, `application/x-www-form-urlencoded` (OAuth token endpoints), `multipart/form-data` (file uploads), `application/octet-stream` (binary), and `application/problem+json` (RFC 9457 error responses).

Several supplementary RFCs govern operational behavior. **RFC 9111** (replacing RFC 7234) defines HTTP caching with Cache-Control, ETag, and conditional request headers. **RFC 6585** introduces status code **429 Too Many Requests** — the single most important status code for ETL rate limiting — along with 428 Precondition Required and 431 Request Header Fields Too Large. **RFC 9457** (replacing RFC 7807) standardizes machine-readable error responses with `type`, `title`, `status`, `detail`, and `instance` fields, enabling schema-aware error parsing. **RFC 8959** defines the `secret-token:` URI scheme for identifying tokens that require secure handling in configuration files.

The YAML schema must expose these as configuration parameters:

```yaml
request:
  method: GET  # GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS
  headers:
    Accept: application/json
    Accept-Encoding: "gzip, deflate, br"
    Content-Type: application/json
  conditional_requests:
    send_if_none_match: true    # RFC 9110 §13 — ETag validation
    track_etags: true
  caching:
    strategy: etag  # etag|last_modified|cache_control|none
```

---

## Sixteen authentication schemes demand a polymorphic configuration model

REST APIs use a wide spectrum of authentication mechanisms. The schema must support **all of them** through a discriminated union pattern keyed on `auth.type`. The complete taxonomy includes:

**Simple credential-based**: No Auth, API Key (in header, query, or cookie per OpenAPI's `in` parameter model), Basic Auth (RFC 7617 — base64-encoded `username:password`), and Digest Auth (RFC 7616 — challenge-response with MD5/SHA-256 hashing).

**Token-based**: Bearer tokens (static or dynamically obtained), JWT (RFC 7519 — with claims like `iss`, `sub`, `aud`, `exp`, and signing algorithms RS256/ES256/HS256), and OAuth 2.0 (RFC 6749) across **six grant types** — `authorization_code` (with PKCE per RFC 7636, mandatory in OAuth 2.1), `client_credentials` (most common for ETL), `password` (deprecated in OAuth 2.1), `implicit` (deprecated), `device_code` (RFC 8628), and refresh token rotation.

**Cloud provider-specific**: AWS Signature v4 (HMAC-based canonical request signing with region, service, access key, secret key, optional session token), Azure AD/Entra ID (OAuth 2.0 with tenant_id, client_id, client_secret, scopes against `login.microsoftonline.com`), and GCP Service Account (JWT signed with RS256 private key, exchanged at `oauth2.googleapis.com/token`).

**Enterprise and specialized**: NTLM (multi-step challenge-response), Kerberos (ticket-based via SPNEGO), Hawk (HMAC with timestamp and nonce), generic HMAC signing (provider-specific string-to-sign construction), and Mutual TLS/mTLS (RFC 8705 — client certificates during TLS handshake).

**Custom auth**: Pre-request flows that execute token-acquisition calls, extract credentials via JSONPath, and inject them into the main request. This covers any authentication pattern not fitting the above categories.

The **client_credentials** flow deserves special attention for ETL pipelines. Token management requires proactive refresh (configurable buffer before expiry, typically **60 seconds**), reactive refresh (retry on 401 with token refresh), caching (in memory, encrypted file, Redis, or vault), and rotation support (grace periods for old tokens during network issues). A comprehensive token management block:

```yaml
token_management:
  cache:
    enabled: true
    storage: memory  # memory|encrypted_file|redis|vault
  refresh:
    strategy: proactive  # proactive|reactive
    pre_expiry_buffer_seconds: 60
    retry_on_401: true
    max_refresh_attempts: 1
```

---

## API client tools reveal proven configuration structures

Analysis of Postman, Insomnia, Bruno, HTTPie, cURL, and OpenAPI reveals convergent patterns worth adopting.

**Postman Collection v2.1** uses a deeply structured JSON format with decomposed URLs (`protocol`, `host[]`, `path[]`, `query[]`, `variable[]`), body modes (`raw`, `formdata`, `urlencoded`, `file`, `graphql`), auth inheritance across collection → folder → request, and `protocolProfileBehavior` for per-request transport settings like `followRedirects` and `maxRedirects`. Variable interpolation uses `{{variable}}` syntax with a five-level scope hierarchy: Global → Collection → Environment → Data → Local.

**Bruno** takes a Git-friendly approach with one `.bru` file per request, organized in filesystem directories. Its custom DSL uses block syntax (`get { url: ... }`, `auth:bearer { token: ... }`, `body:json { ... }`) with `~` prefix to disable items and `@` prefix for local-scope variables. Bruno's collection-level `collection.bru` provides defaults inherited by all requests — a pattern directly applicable to YAML.

**OpenAPI 3.x** provides the most rigorous parameter model: `in: query|header|path|cookie` cleanly separates parameter locations, `servers[].variables` enables URL templating with enums and defaults, and security schemes are defined once in `components.securitySchemes` and referenced by name per-operation. The `$ref` mechanism for reuse maps well to YAML anchors/aliases.

**cURL** offers the most complete transport configuration vocabulary: `--connect-timeout`, `--max-time`, `--retry`, `--retry-delay`, `--retry-max-time`, `--retry-all-errors`, `--proxy`, `--cert`, `--key`, `--cacert`, `-k` (insecure). These map to specific YAML fields.

The cross-tool comparison reveals **essential fields every request configuration needs**:

- **URL construction**: base URL, path, path parameters, query parameters (with disable capability)
- **Body types**: JSON, XML, form-urlencoded, multipart, binary, GraphQL (query + variables), raw text
- **Transport settings**: timeouts (connect, read, write, total), redirect policy (follow + max), SSL verification, client certificates, proxy
- **Session management**: cookie jars (send/store), connection pooling, keep-alive
- **Auth inheritance**: global defaults overridable at any level

---

## ETL orchestration requires DAG semantics, pagination, and resilience patterns

Research into Airflow, Prefect, Dagster, and dlt reveals the orchestration patterns a YAML schema must support.

**Dependency resolution** follows DAG semantics. Steps declare dependencies via `depends_on: [step_id]`, enabling fan-in (multiple dependencies converge) and fan-out (one step triggers multiple parallel steps). Data flows between steps through template expressions like `{{steps.get_customer.response.body.id}}`, with extraction powered by **JMESPath** (preferred for ETL due to field renaming, filtering, and functions like `length()` and `sort_by()`) or **JSONPath** (XPath-like with `$.store.book[*].author` syntax and recursive descent via `$..price`).

**Pagination** is the most operationally complex pattern. The schema must support five strategies:

- **Offset-based**: `offset` + `limit` parameters with `total_path` in response
- **Cursor-based**: `cursor_param` sent in request, `cursor_path` extracted from response (most common in modern APIs)
- **Page-number**: `page` + `per_page` with `total_pages_path`
- **Link header** (RFC 8288): follow `rel="next"` links
- **Keyset**: extract last item's key from response, send as next request's filter parameter

Stop conditions must include `max_pages`, `max_records`, `empty_results` (boolean), and `total_count_reached`. Notably, **dlt's auto-pagination** can detect common patterns automatically — a capability worth documenting as a design aspiration.

**Retry strategies** follow AWS's recommended pattern from the AWS Builders Library: exponential backoff with **full jitter** (`sleep = random(0, min(cap, base * 2^attempt))`), capped at a maximum delay, with status-code-based retry triggers (429, 500, 502, 503, 504) and exception-based triggers (timeout, connection_error). Idempotency keys (via `Idempotency-Key` header) are essential for safely retrying POST requests.

**Circuit breakers** operate in three states — closed (normal), open (fast-fail after `failure_threshold` exceeded), and half-open (limited test requests after `timeout_seconds`). The YAML schema should support `failure_threshold`, `success_threshold`, `timeout_seconds`, `monitor_window_seconds`, and fallback strategies (cached response, default value, error).

**Rate limiting** requires both proactive throttling (`requests_per_second`, `concurrent_requests`, `min_interval_ms`) and reactive handling (parsing `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` headers on 429 responses). A draft IETF RFC proposes standardized `RateLimit` and `RateLimit-Policy` structured headers.

**Conditional execution** enables branching: `condition: "{{steps.check.response.body.status}} == 'active'"`. **Flow composition** allows sub-pipeline references: `type: sub_pipeline, ref: ./extract_pipeline.yaml`. **For-each loops** iterate over upstream results with configurable concurrency.

---

## YAML design patterns enable DRY, validated, secure configurations

**Anchors and aliases** (`&anchor` / `*alias`) with **merge keys** (`<<:`) provide inheritance and override. Docker Compose's `x-` extension field pattern stores reusable templates:

```yaml
x-retry-defaults: &retry_defaults
  max_retries: 3
  backoff_strategy: exponential
  backoff_base_seconds: 2
  retry_on_status: [429, 500, 502, 503, 504]

steps:
  - id: fetch_users
    retry:
      <<: *retry_defaults
      max_retries: 5  # override for this step
```

Merge keys are YAML 1.1 (not formally in YAML 1.2) but are supported by PyYAML and ruamel.yaml. Anchors must be defined before aliases (top-to-bottom), and multiple merges use `<<: [*a, *b]` with first-match-wins semantics.

**Environment variable interpolation** follows the `${VAR}` pattern (Docker Compose, Spring Boot) with `${VAR:-default}` for defaults and `${VAR:?error}` for required variables. Python libraries like **pyaml-env**, **piny**, and **yamlenv** implement this via regex replacement or custom YAML tag constructors. The `${{secrets.KEY}}` pattern (GitHub Actions style) can reference external secret managers.

**Schema validation** should use **Pydantic v2** as the primary validation layer — its discriminated unions handle polymorphic configs (different auth types, pagination strategies, body formats) elegantly, and it generates JSON Schema for documentation and IDE support. The validation chain: load YAML with `yaml.safe_load()` → parse with Pydantic models → fail fast with clear error messages.

**Naming conventions**: Use **snake_case** consistently (matching Python idiom and Docker Compose/Ansible conventions). Limit nesting to 3–4 levels. Place metadata first (`version`, `name`), then global settings, then specific configurations.

---

## Dataset output configuration handles the "L" in ETL

Response transformation uses JMESPath or JSONPath to extract, rename, and restructure API response data. The schema supports **flattening** (nested JSON → flat columns with configurable separator and max depth), **type coercion** (string dates → datetime with format strings, string numbers → decimal with precision), and **computed fields** (concatenation, conditional expressions, metadata injection like `_loaded_at: now()`).

**Five write dispositions** cover all loading patterns:

- **Append**: Insert all records, no deduplication
- **Replace**: Truncate-and-load or atomic swap (create temp table, rename)
- **Upsert**: Insert or update based on `primary_key`, with optional `compare_columns` for change detection
- **Merge SCD Type 1**: Overwrite changed fields, no history
- **Merge SCD Type 2**: Track history with `valid_from`, `valid_to`, `is_current` columns, configurable `infinity_date` and `tracked_columns`

**Data quality checks** include required field validation, type/format validation (regex patterns, enums, ranges), uniqueness constraints, null percentage thresholds, row count assertions (min/max), and freshness checks (`max_age: "24 hours"` on timestamp columns). Each check specifies `on_failure: warn|error|abort`.

**Incremental loading** tracks a `cursor_column` (typically `updated_at`) with configurable `initial_value`, `cursor_type` (datetime, integer, string), and `lookback_window` for late-arriving data.

---

## Python HTTP libraries shape the implementation mapping

The three candidate libraries — **requests**, **httpx**, and **aiohttp** — have different configuration surfaces that the YAML schema must abstract over.

**httpx** is the recommended choice: it supports both sync and async, offers HTTP/2 via `http2=True`, provides **four distinct timeout categories** (connect, read, write, pool), configurable connection limits (`max_keepalive_connections`, `max_connections`, `keepalive_expiry`), event hooks for logging, and a requests-compatible API. SOCKS proxy support requires `httpx-socks`.

**requests** remains the most widely used. Retry configuration uses `urllib3.util.retry.Retry` mounted via `HTTPAdapter` with parameters: `total`, `connect`, `read`, `backoff_factor`, `status_forcelist`, `allowed_methods`, `respect_retry_after_header`, `backoff_max`, `backoff_jitter`. Connection pooling uses `pool_connections` and `pool_maxsize` on the adapter.

**aiohttp** offers maximum async throughput via `TCPConnector` with `limit` (total connections), `limit_per_host`, `ttl_dns_cache`, and `enable_cleanup_closed`. Timeouts use `aiohttp.ClientTimeout` with `total`, `connect`, `sock_connect`, and `sock_read`.

For **Python YAML parsing**, use **ruamel.yaml** for YAML 1.2 compliance and round-trip comment preservation, or PyYAML with **`safe_load()` only** — `yaml.load()` executes arbitrary Python via `!!python/object` tags. **strictyaml** disables all dangerous features by design but lacks anchor/alias support.

**Pydantic v2 discriminated unions** model polymorphic configurations:

```python
from typing import Literal, Union, Annotated
from pydantic import BaseModel, Field

class BasicAuth(BaseModel):
    type: Literal["basic"]
    username: str
    password: str

class OAuth2Auth(BaseModel):
    type: Literal["oauth2"]
    flow: str
    token_url: str
    client_id: str
    client_secret: str

AuthConfig = Annotated[
    Union[BasicAuth, OAuth2Auth, ...],
    Field(discriminator="type")
]
```

**asyncio patterns** for parallel execution: use `asyncio.Semaphore` for concurrency limiting, `asyncio.gather(*tasks, return_exceptions=True)` for parallel dispatch, or `asyncio.TaskGroup` (Python 3.11+) for structured concurrency with automatic cancellation on failure.

---

## Security requires defense in depth across the configuration lifecycle

**Secret management** follows one cardinal rule: **never store secrets in plain text in YAML**. The schema should support multiple secret reference patterns:

- `${API_KEY}` — environment variables (simplest)
- `vault://secret/data/myapp#password` — HashiCorp Vault
- `file:///run/secrets/api_token` — Docker/Kubernetes secret files
- `ENC[AES256_GCM,...]` — SOPS (Secrets OPerationS) encrypted values with AWS KMS, GCP KMS, or PGP backends
- `${secrets.API_KEY}` — platform-specific secret injection

SOPS encrypts values in-place using `encrypted_regex: ^(password|secret|key|token)$` in `.sops.yaml`, enabling git-committed encrypted configs.

**TLS configuration** enforces TLS 1.2 minimum (`ssl.TLSVersion.TLSv1_2`), certificate verification by default (`verify: true`), optional CA bundle paths, and client certificate support for mTLS (`cert` + `key` or PKCS#12 `.p12` file). Cipher suite overrides should be available but rarely needed.

**Input sanitization** prevents three attack vectors: YAML injection (mitigated by `safe_load()`), SSRF (URL allowlists + private IP range blocking for 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8), and header injection (reject values containing `\r\n`).

**Proxy configuration** supports HTTP, HTTPS, SOCKS4, and SOCKS5 (with `socks5h://` for DNS-through-proxy), proxy authentication (basic, NTLM), no-proxy lists with glob patterns, and environment variable fallback (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`). All three Python libraries support HTTP/HTTPS natively; SOCKS requires `requests[socks]`, `httpx-socks`, or `aiohttp-socks`.

---

## Observability spans logging, tracing, metrics, and alerting

**Structured JSON logging** captures `timestamp`, `level`, `correlation_id`, `http_method`, `http_url`, `http_status`, `duration_ms`, `response_size_bytes`, `retry_count`, and `error_message`. Sensitive data masking applies regex patterns to redact `Authorization`, `X-API-Key`, `password`, `token`, and `secret` values, replacing them with `***REDACTED***`.

**Distributed tracing** integrates with OpenTelemetry using W3C Trace Context headers (`traceparent` and `tracestate`). Python instrumentation libraries exist for all three HTTP clients: `opentelemetry-instrumentation-requests`, `opentelemetry-instrumentation-httpx`, and `opentelemetry-instrumentation-aiohttp-client`. Standard span attributes follow **OpenTelemetry HTTP semantic conventions v1.23.0+**: `http.request.method`, `url.full`, `http.response.status_code`, `http.request.resend_count`, `error.type`. The primary metric is `http.client.request.duration` (histogram in seconds with recommended buckets from 5ms to 10s).

**Alerting rules** map to Prometheus-style expressions: error rate thresholds (e.g., >5% 5xx responses over 5 minutes), P95/P99 latency thresholds, consecutive failure counts, and rate limit hit detection (429 status codes). Notification channels include Slack webhooks, PagerDuty, email, and generic webhooks. SLA violation alerts monitor availability percentage over rolling windows.

**Audit trails** record who triggered each API call, when, what endpoint was called, and the result — stored in append-only, immutable storage (S3 Object Lock, Azure Immutable Blob) with hash chaining for tamper detection. GDPR requires pseudonymization of personal data in logs with **5–7 year** retention; SOC2 requires immutable records with **6–12 month** minimum retention.

```yaml
observability:
  logging:
    level: INFO
    format: json
    sensitive_data:
      mask_patterns: [Authorization, X-API-Key, password, token]
  tracing:
    enabled: true
    exporter: otlp
    propagation: w3c
    sampling:
      strategy: parent_based
      ratio: 0.1
  metrics:
    enabled: true
    exporter: prometheus
    collection:
      request_duration: true
      error_rate: true
      retry_count: true
  alerting:
    rules:
      - name: high_error_rate
        condition: { error_rate_percent: 5, window: 5m }
        severity: critical
        channels: [pagerduty, slack]
```

---

## The ADR should follow MADR format with schema comparison

**MADR (Markdown Architectural Decision Records) v4.0** is the recommended ADR format. Created by Olaf Zimmermann and community, it extends Michael Nygard's original 2011 template (Title, Status, Context, Decision, Consequences) with **Decision Drivers**, **Considered Options**, and **Pros/Cons analysis per option**. The MADR front matter includes `status`, `date`, `decision-makers`, `consulted`, and `informed` fields.

For a YAML schema ADR, the **Considered Options** section should compare at minimum:

- **Option 1: YAML configuration with Pydantic validation** — supports comments, anchors/aliases, env var interpolation, Python-native validation
- **Option 2: JSON configuration with JSON Schema** — strict syntax, universal tooling, no ambiguity, but no comments
- **Option 3: TOML configuration** — simple spec, good for flat configs, but poor for deeply nested structures
- **Option 4: Python dataclass/Pydantic objects** — type-safe with IDE support, but requires code changes for config updates
- **Option 5: Database-backed configuration** — dynamic updates, but adds infrastructure dependency and is harder to version control

Each option should include concrete schema examples showing how a representative API call would be configured. **Decision Drivers** should explicitly list: developer experience (readability, writeability), validation capability, extensibility (add new APIs without code changes), security (secret injection), observability integration, and compatibility with existing team tooling.

**Documenting extensibility**: the ADR should specify a `version` field for schema evolution, define how new fields can be added without breaking existing configs (all new fields have defaults), describe the deprecation strategy for removed fields, and commit to Pydantic model validation that generates JSON Schema for IDE autocompletion.

---

## Conclusion

This research establishes the complete design space for a YAML-based REST API configuration schema in ETL pipelines. Three insights stand out as particularly important for the ADR.

First, **authentication is the most complex axis** — with 16+ distinct schemes, the schema must use a discriminated union pattern (`auth.type` as the discriminator) with scheme-specific sub-configurations, and token management (caching, proactive refresh, rotation) deserves its own top-level block rather than being buried inside auth configuration.

Second, **pagination and data passing between steps are the features that distinguish an ETL configuration from a simple HTTP client configuration**. The schema must treat pagination as a first-class concern with five strategy types, configurable stop conditions, and cursor extraction via JMESPath/JSONPath. Step-to-step data flow via template expressions (`{{steps.auth.response.body.access_token}}`) enables declarative pipeline composition that replaces procedural code.

Third, **the YAML schema should adopt a layered defaults model** inspired by Postman's collection → folder → request inheritance and OpenAPI's global → operation security override. Global defaults (retry, timeout, auth, headers) apply to all steps unless overridden. YAML anchors and merge keys (`<<: *defaults`) make this DRY while keeping individual step configurations explicit and readable. The entire configuration validates through Pydantic discriminated unions that generate JSON Schema, enabling IDE autocompletion and pre-runtime validation — a capability none of the existing orchestration tools (Airflow, Prefect, Dagster) provide for their API call configurations.