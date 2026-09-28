import { describe, it, expect, vi } from 'vitest';

describe('createReadOnlyMemoryService', () => {
  it('allows getWorkingMemory + getMessages', { timeout: 30_000 }, async () => {
    const { createReadOnlyMemoryService } = await import('./readonly-guard');
    const svc = createReadOnlyMemoryService({ threadId: 't-1' });
    expect(typeof svc.getWorkingMemory).toBe('function');
    expect(typeof svc.getMessages).toBe('function');
  });

  it('throws ReadOnlyMemoryError on setWorkingMemory', async () => {
    const { createReadOnlyMemoryService, ReadOnlyMemoryError } = await import('./readonly-guard');
    const svc = createReadOnlyMemoryService({ threadId: 't-1' });
    await expect(svc.setWorkingMemory({} as never)).rejects.toBeInstanceOf(ReadOnlyMemoryError);
  });

  it('throws on patchWorkingMemory', async () => {
    const { createReadOnlyMemoryService, ReadOnlyMemoryError } = await import('./readonly-guard');
    const svc = createReadOnlyMemoryService({ threadId: 't-1' });
    await expect(svc.patchWorkingMemory({} as never)).rejects.toBeInstanceOf(ReadOnlyMemoryError);
  });

  it('updateWorkingMemory tool, when wrapped readOnly, throws', async () => {
    const { wrapToolReadOnly, ReadOnlyMemoryError } = await import('./readonly-guard');
    const fakeTool = { execute: vi.fn().mockResolvedValue({ ok: true }) };
    const wrapped = wrapToolReadOnly(fakeTool, 'updateWorkingMemory');
    await expect(wrapped.execute({}, {} as never)).rejects.toBeInstanceOf(ReadOnlyMemoryError);
  });
});
