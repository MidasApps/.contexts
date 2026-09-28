export interface BackfillUser {
  email?: string;
  clientAccess?: { clientId: string }[];
}

export interface BackfillEntry {
  email: string;
  clientIds: string[];
}

/** Para cada usuário com email + clientAccess não-vazio, deriva o claim clientIds. */
export function buildBackfillPlan(users: BackfillUser[]): BackfillEntry[] {
  return users
    .filter((u): u is Required<Pick<BackfillUser, 'email'>> & BackfillUser =>
      !!u.email && Array.isArray(u.clientAccess) && u.clientAccess.length > 0)
    .map((u) => ({ email: u.email, clientIds: u.clientAccess!.map((ca) => ca.clientId) }));
}
