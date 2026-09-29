/**
 * Cache LRU em memoria para resultados de scorers (Sprint 3.D, Task 11).
 *
 * Chave: sha256 hex de
 *   `${briefingId}|${scorerName}|${judgeModelVersion}|${glossaryVersion}|${regulatoryPackVersion}`
 *
 * Idempotencia por hash permite resume parcial (DoD da Task 11).
 */
import { LRUCache } from 'lru-cache';
import { createHash } from 'node:crypto';
import type { ScoreResult } from '../scorers/types';

export interface CacheKeyArgs {
  briefingId: string;
  scorerName: string;
  judgeModelVersion: string;
  glossaryVersion: string;
  regulatoryPackVersion: string;
}

export function cacheKey(args: CacheKeyArgs): string {
  const raw = [
    args.briefingId,
    args.scorerName,
    args.judgeModelVersion,
    args.glossaryVersion,
    args.regulatoryPackVersion,
  ].join('|');
  return createHash('sha256').update(raw).digest('hex');
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX = 5_000;

const cache = new LRUCache<string, ScoreResult>({ max: MAX, ttl: TTL_MS });

export function getCached(key: string): ScoreResult | undefined {
  return cache.get(key);
}

export function setCached(key: string, value: ScoreResult): void {
  cache.set(key, value);
}

export function clearCache(): void {
  cache.clear();
}

export function cacheSize(): number {
  return cache.size;
}
