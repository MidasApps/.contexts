"use client";

import { createContext, use, type ReactNode } from "react";
import type { AuthPort } from "./auth-port.ts";

const AuthContext = createContext<AuthPort | null>(null);

/** Provides the auth client (Firebase in the apps, a fake in tests) to the client tree. */
export function AuthProvider({ auth, children }: { auth: AuthPort; children: ReactNode }) {
  return <AuthContext value={auth}>{children}</AuthContext>;
}

/**
 * The auth port (sign-in, MFA, tokens, sign-out).
 * @throws {Error} outside `AuthProvider` (a composition bug).
 */
export const useAuth = (): AuthPort => {
  const auth = use(AuthContext);
  if (auth === null) throw new Error("useAuth must be used inside AuthProvider");
  return auth;
};
