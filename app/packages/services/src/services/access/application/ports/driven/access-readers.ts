import type { GrantReader } from "./grant-reader.ts";
import type { NodeChainReader } from "./node-chain-reader.ts";
import type { PrincipalStatusReader } from "./principal-status-reader.ts";
import type { RoleReader } from "./role-reader.ts";

/** The four driven ports `authorize()` reads from (Firestore adapters in Task 9). */
export type AccessReaders = {
  readonly grants: GrantReader;
  readonly roles: RoleReader;
  readonly nodeChains: NodeChainReader;
  readonly principals: PrincipalStatusReader;
};
