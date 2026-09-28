import { describe, expect, it, vi } from 'vitest';
import { isTransientNetworkError, withRetry } from './retry';

const epipe = () => Object.assign(new Error('request to https://bigquery.googleapis.com/upload failed, reason: write EPIPE'), { code: 'EPIPE' });
const noSleep = async (): Promise<void> => {};

describe('withRetry', () => {
  it('returns the result without retrying when the first attempt succeeds', async () => {
    const operation = vi.fn(async () => 'ok');

    await expect(withRetry(operation, { attempts: 3, sleep: noSleep })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure and returns the later success', async () => {
    const operation = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(epipe())
      .mockResolvedValueOnce('loaded');

    await expect(withRetry(operation, { attempts: 3, sleep: noSleep })).resolves.toBe('loaded');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('gives up after the last attempt and rethrows the last error', async () => {
    const operation = vi.fn(async () => { throw epipe(); });

    await expect(withRetry(operation, { attempts: 3, sleep: noSleep })).rejects.toThrow(/EPIPE/);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry an error that is not transient', async () => {
    const schemaError = new Error('Provided Schema does not match Table');
    const operation = vi.fn(async () => { throw schemaError; });

    await expect(withRetry(operation, { attempts: 3, sleep: noSleep })).rejects.toBe(schemaError);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('waits with exponential backoff and reports each retry', async () => {
    const waits: number[] = [];
    const retries: Array<{ attempt: number; delayMs: number }> = [];
    const operation = vi.fn(async () => { throw epipe(); });

    await expect(withRetry(operation, {
      attempts: 4,
      baseDelayMs: 1000,
      sleep: async (ms) => { waits.push(ms); },
      onRetry: ({ attempt, delayMs }) => retries.push({ attempt, delayMs }),
    })).rejects.toThrow();

    expect(waits).toEqual([1000, 2000, 4000]);
    expect(retries).toEqual([{ attempt: 1, delayMs: 1000 }, { attempt: 2, delayMs: 2000 }, { attempt: 3, delayMs: 4000 }]);
  });
});

describe('isTransientNetworkError', () => {
  it.each([
    ['EPIPE by code', Object.assign(new Error('x'), { code: 'EPIPE' })],
    ['ECONNRESET by code', Object.assign(new Error('x'), { code: 'ECONNRESET' })],
    ['EPIPE only in the message', new Error('request failed, reason: write EPIPE')],
    ['socket hang up', new Error('socket hang up')],
    ['HTTP 503', Object.assign(new Error('Service Unavailable'), { code: 503 })],
    ['HTTP 429', Object.assign(new Error('Too Many Requests'), { code: 429 })],
  ])('treats %s as transient', (_label, error) => {
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it.each([
    ['a schema error', new Error('Provided Schema does not match Table')],
    ['HTTP 403', Object.assign(new Error('Access Denied'), { code: 403 })],
    ['HTTP 400', Object.assign(new Error('Invalid'), { code: 400 })],
    ['a non-error value', 'boom'],
  ])('does not treat %s as transient', (_label, error) => {
    expect(isTransientNetworkError(error)).toBe(false);
  });
});
