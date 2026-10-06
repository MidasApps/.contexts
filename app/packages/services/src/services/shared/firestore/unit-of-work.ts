import type { Firestore, Transaction } from "firebase-admin/firestore";
import { runInTransaction } from "./transaction-runner.ts";

/**
 * Runs a use case's reads and writes atomically. Firestore adapters use the transaction
 * handle; Firestore requires every read of `fn` to happen before its first write, so use
 * cases read first, decide, then write. `fn` may run more than once (contention retry).
 */
export type UnitOfWork = { readonly run: <T>(fn: (tx: Transaction) => Promise<T>) => Promise<T> };

/** The Firestore unit of work (retried on contention, see `runInTransaction`). */
export const createFirestoreUnitOfWork = (deps: { firestore: Firestore }): UnitOfWork => ({
  run: (fn) => runInTransaction(deps.firestore, fn),
});

// In-memory fakes ignore the handle; it is never dereferenced.
const DETACHED_TRANSACTION = Object.freeze({}) as Transaction;

/** Unit of work for in-memory fakes (unit tests): runs `fn` once, without isolation. */
export const inMemoryUnitOfWork: UnitOfWork = { run: (fn) => fn(DETACHED_TRANSACTION) };
