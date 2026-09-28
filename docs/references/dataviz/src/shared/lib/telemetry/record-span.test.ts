import { describe, it, expect, vi, afterEach } from 'vitest';
import { recordSpan } from './record-span';

describe('recordSpan', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  function setSpy() {
    spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  }

  afterEach(() => {
    spy?.mockRestore();
  });

  it('logs ok status with duration and returns value', async () => {
    setSpy();
    const out = await recordSpan({ name: 'op', attributes: { a: 1 } }, async () => 'val');
    expect(out).toBe('val');
    expect(spy).toHaveBeenCalledOnce();
    const line = spy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({
      event: 'span',
      name: 'op',
      status: 'ok',
      attributes: { a: 1 },
    });
    expect(typeof parsed.durationMs).toBe('number');
    expect(parsed.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof parsed.ts).toBe('string');
  });

  it('logs error status and rethrows', async () => {
    setSpy();
    await expect(
      recordSpan({ name: 'fail' }, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const line = spy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({ status: 'error', name: 'fail', error: 'boom' });
  });

  it('accepts sync function returning a value', async () => {
    setSpy();
    const out = await recordSpan({ name: 'sync' }, () => 42);
    expect(out).toBe(42);
    const line = spy.mock.calls[0]![0] as string;
    expect(JSON.parse(line).status).toBe('ok');
  });
});
