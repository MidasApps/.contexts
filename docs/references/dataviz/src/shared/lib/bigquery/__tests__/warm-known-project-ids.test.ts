import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/shared/lib/firebase/admin', () => ({
  getAdminFirestore: () => ({ collection: () => ({ select: () => ({ get: h.get }) }) }),
}));

beforeEach(() => {
  vi.resetModules();
  h.get.mockReset();
});

describe('warmKnownProjectIds', () => {
  it('registers every dataSource projectId for error redaction', async () => {
    h.get.mockResolvedValue({ docs: [{ get: () => 'acmeprod' }, { get: () => 'liquid-play-prod' }, { get: () => undefined }] });
    const { warmKnownProjectIds } = await import('../warm-known-project-ids');
    const { knownProjectIds } = await import('../known-project-ids');

    await warmKnownProjectIds();

    expect(knownProjectIds()).toEqual(expect.arrayContaining(['acmeprod', 'liquid-play-prod']));
  });

  it('reads Firestore once within the cache window', async () => {
    h.get.mockResolvedValue({ docs: [] });
    const { warmKnownProjectIds } = await import('../warm-known-project-ids');

    await warmKnownProjectIds();
    await warmKnownProjectIds();

    expect(h.get).toHaveBeenCalledTimes(1);
  });

  it('does not throw when Firestore fails, and tries again only after a pause', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      h.get.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce({ docs: [] });
      const { warmKnownProjectIds } = await import('../warm-known-project-ids');

      await expect(warmKnownProjectIds()).resolves.toBeUndefined();
      // Sem a pausa, cada pergunta do chat relia o Firestore fora do ar.
      await warmKnownProjectIds();
      expect(h.get).toHaveBeenCalledTimes(1);

      vi.setSystemTime(Date.now() + 31_000);
      await warmKnownProjectIds();
      expect(h.get).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
