# 0018. Mobile targets deferred (follow-up #14)

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/apps/desktop` (Tauri 2), `app/packages/client` (local decision; the framework is unchanged)
- **Resolves:** follow-up #14 (`docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md`); SP2 spec §11; SP0 summary §4 (`docs/plans/2026-09-29-sp0-app-foundation/reports/sp0-summary.md`)

## Context

The core targets web and desktop in v1; mobile is desired later through Tauri 2's Android and iOS targets. The SP0 spike found that the official Tauri `notification` plugin covers local notifications only; remote push (FCM/APNs) exists only in young, single-maintainer community plugins; Firebase App Check in a webview only has web providers (reCAPTCHA), which expect a real web origin. None of it was verified on a device: this machine has no Android targets and no macOS host.

## Decision

1. **v1 ships no mobile target.** Web and desktop only. Desktop runs without remote push and without App Check; `/v1` accepts desktop requests without an App Check token (in-app realtime and local notifications instead of push).
2. **What a mobile build needs** (future subproject):
   - Android: SDK Platform, Platform-Tools, NDK, Build-Tools, Command-line Tools, `JAVA_HOME`/`ANDROID_HOME`/`NDK_HOME`, rustup targets `aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`, `pnpm tauri android init`;
   - iOS: macOS with Xcode and CocoaPods, targets `aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim`, `pnpm tauri ios init`;
   - Vite dev server bound to `TAURI_DEV_HOST` with HMR port 1421; CORS allowlist and CSP rechecked for the mobile webview origins;
   - **own thin plugins** (Kotlin/Swift, exposed as Tauri commands) for push (FCM `FirebaseMessagingService` on Android, APNs on iOS) and attestation (Play Integrity on Android, App Attest on iOS) handing a token to JS or to `/v1`; community plugins only for prototyping, because push and attestation are security-sensitive;
   - server-side App Check verification optional per client type (`firebase-admin` `getAppCheck().verifyToken`);
   - secure storage: the `keyring` crate (decision 0017) covers Windows, macOS and Linux; its iOS Keychain support must be verified and Android Keystore needs a plugin or a platform-specific store behind the same `secure-store` port.
3. **What SP2 keeps portable:** `[lib] crate-type = ["staticlib","cdylib","rlib"]` and `mobile_entry_point` stay in `src-tauri`; `gen/android` and `gen/apple` stay versionable; shared views keep touch targets ≥ 44 px on primary actions, navigation becomes a sheet on small widths, layouts are mobile-first with the DESIGN.md breakpoints, and no view depends on hover or on a physical keyboard (shortcuts are accelerators only).

## Consequences

- Follow-up #14 is closed by this decision; the mobile work becomes its own subproject with an Android device or emulator and a sandbox Firebase project.
- Push-dependent features (approval notifications in SP5) must also work through in-app realtime.

## Alternatives rejected

- **Ship Android in v1 with a community push plugin.** Unverified, single-maintainer dependency on a security-sensitive path.
- **Capacitor or React Native for mobile.** A second shell and a second native toolchain; Tauri 2 already builds for mobile from the same `src-tauri`.
- **Enforce App Check for desktop with reCAPTCHA.** reCAPTCHA expects a web origin, not `tauri://localhost` / `http://tauri.localhost`.
