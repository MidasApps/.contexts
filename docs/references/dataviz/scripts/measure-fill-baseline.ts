#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';

interface Span {
  event: string;
  name: string;
  durationMs: number;
  attributes?: Record<string, unknown>;
  status?: string;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx]!;
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: pnpm tsx scripts/measure-fill-baseline.ts <log.ndjson>');
    process.exit(1);
  }
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  const spans: Span[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Span;
      if (parsed.event === 'span' && parsed.name === 'fill_layout_total') {
        spans.push(parsed);
      }
    } catch {
      // skip non-JSON lines
    }
  }

  const byCount = new Map<number, number[]>();
  for (const s of spans) {
    const n = (s.attributes as { slotCount?: number } | undefined)?.slotCount ?? 0;
    if (!byCount.has(n)) byCount.set(n, []);
    byCount.get(n)!.push(s.durationMs);
  }

  console.log('| slotCount | samples | p50 (ms) | p95 (ms) | p99 (ms) |');
  console.log('|-----------|---------|----------|----------|----------|');
  for (const [n, durs] of [...byCount.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...durs].sort((a, b) => a - b);
    console.log(
      `| ${n} | ${durs.length} | ${percentile(sorted, 0.5).toFixed(0)} | ${percentile(sorted, 0.95).toFixed(0)} | ${percentile(sorted, 0.99).toFixed(0)} |`,
    );
  }

  if (spans.length === 0) {
    console.error('Nenhum span fill_layout_total encontrado em', path);
    process.exit(2);
  }
}

main();
