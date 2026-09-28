import { getWorkingMemory, getMessages, type StoredMessage } from './memory-service';
import type { WorkingMemory, WorkingMemoryPatch } from './schema';

export class ReadOnlyMemoryError extends Error {
  constructor(operation: string) {
    super(
      `Memory operation '${operation}' not allowed on readOnly service (sub-agents cannot write working memory)`,
    );
    this.name = 'ReadOnlyMemoryError';
  }
}

export interface ReadOnlyMemoryService {
  getWorkingMemory(): Promise<WorkingMemory | null>;
  getMessages(opts?: { limit?: number }): Promise<StoredMessage[]>;
  setWorkingMemory(_: WorkingMemory): Promise<never>;
  patchWorkingMemory(_: WorkingMemoryPatch): Promise<never>;
}

export function createReadOnlyMemoryService(opts: { threadId: string }): ReadOnlyMemoryService {
  return {
    getWorkingMemory: () => getWorkingMemory(opts.threadId),
    getMessages: (o = {}) => getMessages(opts.threadId, { limit: o.limit ?? 50 }),
    setWorkingMemory: () => Promise.reject(new ReadOnlyMemoryError('setWorkingMemory')),
    patchWorkingMemory: () => Promise.reject(new ReadOnlyMemoryError('patchWorkingMemory')),
  };
}

/**
 * Wrap any AI SDK tool to refuse execution. Useful for ensuring the
 * `updateWorkingMemory` tool from Sprint 1.A is never invocable by sub-agents.
 */
export function wrapToolReadOnly<T extends { execute: (...a: unknown[]) => Promise<unknown> }>(
  _tool: T,
  name: string,
): T {
  return {
    ..._tool,
    execute: () => Promise.reject(new ReadOnlyMemoryError(name)),
  } as T;
}
