/** A Firebase Auth user as the seed sees it. */
export type AuthUser = { localId: string; email: string; displayName?: string | undefined; emailVerified: boolean };

export type AuthUserInput = { email: string; password: string; displayName: string; emailVerified: boolean };

/** Port for the admin operations the local seed needs (driven by the Auth Emulator adapter). */
export type AuthAdmin = {
  findUserByEmail: (email: string) => Promise<AuthUser | undefined>;
  createUser: (input: AuthUserInput) => Promise<AuthUser>;
  updateUser: (localId: string, input: AuthUserInput) => Promise<AuthUser>;
};
