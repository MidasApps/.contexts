import { LRUCache } from 'lru-cache';
import { createHash } from 'node:crypto';
import type { BusinessContext } from './types';

const TTL_MS = 5 * 60 * 1000;
const MAX = 500;

const cache = new LRUCache<string, BusinessContext>({ max: MAX, ttl: TTL_MS });

export function hashKey(args: {
  clientId: string;
  personaId: string;
  briefing: string;
}): string {
  const norm = `${args.clientId}|${args.personaId}|${args.briefing.trim().toLowerCase()}`;
  return createHash('sha256').update(norm, 'utf8').digest('hex').slice(0, 16);
}

export function getCached(key: string): BusinessContext | undefined {
  return cache.get(key);
}

export function setCached(key: string, value: BusinessContext): void {
  cache.set(key, value);
}

export function clearCache(): void {
  cache.clear();
}

export function getCacheSize(): number {
  return cache.size;
}
