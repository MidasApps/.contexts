/**
 * External token store for cross-origin auth via postMessage.
 * When this app runs inside an iframe (e.g. Liquid Artifact shell),
 * the parent sends a Firebase ID Token via postMessage.
 * This module stores it so fetch calls can use it instead of
 * requiring a separate Firebase Auth login.
 */

let externalToken: string | null = null;

export function getExternalToken(): string | null {
  return externalToken;
}

export function setExternalToken(token: string | null): void {
  externalToken = token;
}

export function hasExternalToken(): boolean {
  return externalToken !== null;
}
