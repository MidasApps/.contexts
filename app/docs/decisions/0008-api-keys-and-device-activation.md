# 0008. API keys and device activation

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/packages/services` (contexts `identity`, `access`), `app/packages/contracts` (local decision of the
  boilerplate; the framework in `.contexts/` is unchanged)
- **Refines:** SP1 spec §6.3, §6.4, §5.2 step 3, §5.3

## Context

Integrations need non-interactive credentials (`service` principal) and shared devices (kiosks, terminals) need to
act inside one tenant without a personal account (`device` principal). Both must be revocable, hashed at rest
(`rules/security.md` §1, §12), resistant to guessing (§8) and unable to exceed what a person granted them (§3).

## Decision

### API keys

1. **Format** `<prefix>_<publicId>_<secret>`: `prefix` = `API_KEY_PREFIX` (default `core`, `^[a-z]{2,12}$`) so the
   pipeline routes the credential before touching Firebase and secret scanners can match it; `publicId` = 12 chars
   base32 (lookup key, unique); `secret` = 32 random bytes, base64url (256 bits).
2. **Storage.** Only `publicId` and `sha256(secret)` are stored. Comparison uses `crypto.timingSafeEqual`. A fast
   hash is enough because the secret has 256 bits of entropy (no dictionary to slow down). The secret appears only
   in the `201` of creation and is `sensitive` in the contract.
3. **Owner-bound permissions.** A key belongs to an owner user and a node. `authorize()` requires the key active,
   not expired, the node inside the key's node and the permission in `scopes`, then evaluates the **owner** at the
   node: effective = `scopes ∩ owner's current grants`. Creating a key requires `core.api-key.create` and
   `scopes ⊆ effective(actor, node)` (no escalation). Removing the owner from the tenant revokes the owner's keys.
4. **Expiry required**, at most 365 days. `lastUsedAt` is written at most once per minute.
5. **Lockout.** Failed authentications are counted per IP (policy `api-key-failure`, 20 / min, decision 0009);
   over the limit the pipeline answers `429` **before** hashing.

### Device activation

1. An admin with `core.device.create` creates an activation `{ label, node, roles }` (roles ⊆ admin's effective
   permissions) and gets a one-time `code`: 8 Crockford base32 chars (40 bits), TTL 10 minutes, single use, stored
   as `sha256(code)`. Input is normalized (upper-case, strip `-` and spaces, `O→0`, `I/L→1`).
2. `POST /v1/device-activations/redeem { code }` (no auth) is limited to 5 failures / 15 min per IP. 40 bits with
   that limit and a 10-minute TTL makes online guessing impractical. Success creates `devices/{id}`, a membership
   with `principalType: "device"`, the projection, and returns `createCustomToken(deviceId, { principalType:
   "device", tenantId })`.
3. Every request re-checks `devices/{id}` is active in the token's tenant. Revoke sets the status, removes grants,
   calls `revokeRefreshTokens(deviceId)` and disables the Auth user.

## Consequences

- A key never outlives its owner's access and never grants more than the owner has now.
- Device tokens are Firebase ID tokens, so the Bearer pipeline and Security Rules handle them like users, with the
  `principalType` claim deciding the principal.
- Leaked keys can be found by prefix in logs or repositories; the full key is never logged.

## Alternatives rejected

- **Opaque random key without prefix/publicId.** Needs a hash index scan and cannot be recognised by scanners.
- **Argon2/bcrypt for key secrets.** Adds latency on every request with no gain for 256-bit random secrets.
- **Long device codes or QR only.** Kiosk setup is typed by people; short codes plus lockout and TTL are enough.
- **Keys with their own role set, independent of the owner.** A person who loses access would keep acting through
  their keys.
