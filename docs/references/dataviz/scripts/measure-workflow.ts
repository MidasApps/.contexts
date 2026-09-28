#!/usr/bin/env tsx
/**
 * Sprint 2.B Task 18 — Aggregate per-step p50/p95/p99 from workflow span logs.
 *
 * Usage: pnpm measure:workflow <ndjson-file>
 *
 * The input file is expected to contain one JSON span per line (the format
 * emitted by `recordSpan`). Spans whose `name` starts with `workflow:` or
 * `step:` are aggregated; everything else is ignored.
 */
import { readFileSync } from 'node:fs';

interface Span {
  event?: string;
  name?: string;
  durationMs?: number;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx]!;
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: pnpm measure:workflow <ndjson>');
    process.exit(1);
  }
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  const byName = new Map<string, number[]>();
  for (const line of lines) {
    try {
      const s = JSON.parse(line) as Span;
      if (s.event !== 'span') continue;
      if (!s.name?.startsWith('step:') && !s.name?.startsWith('workflow:')) continue;
      if (typeof s.durationMs !== 'number') continue;
      if (!byName.has(s.name)) byName.set(s.name, []);
      byName.get(s.name)!.push(s.durationMs);
    } catch {
      /* skip malformed line */
    }
  }

  console.log('| span | samples | p50 (ms) | p95 (ms) | p99 (ms) |');
  console.log('|------|---------|----------|----------|----------|');
  for (const [name, durs] of [...byName.entries()].sort()) {
    const sorted = [...durs].sort((a, b) => a - b);
    console.log(
      `| \`${name}\` | ${durs.length} | ${percentile(sorted, 0.5).toFixed(0)} | ${percentile(sorted, 0.95).toFixed(0)} | ${percentile(sorted, 0.99).toFixed(0)} |`,
    );
  }
}

main();
