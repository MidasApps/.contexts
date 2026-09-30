import type { Firestore, Transaction } from "firebase-admin/firestore";

const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Runs `fn` in a Firestore transaction, retried on contention up to
 * `maxAttempts` (default 5). Keep `fn` short and free of side effects outside
 * the transaction: it may run more than once.
 * @returns what `fn` returns on the committed attempt.
 */
export const runInTransaction = <T>(
  firestore: Pick<Firestore, "runTransaction">,
  fn: (tx: Transaction) => Promise<T>,
  options: { maxAttempts?: number } = {},
): Promise<T> => firestore.runTransaction(fn, { maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS });
