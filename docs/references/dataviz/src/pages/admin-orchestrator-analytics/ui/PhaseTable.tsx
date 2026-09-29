'use client';

import type { PhaseLatencyRow } from '@app/api/admin/orchestrator-metrics/route';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/shared/ui/table';

interface Props {
  rows: PhaseLatencyRow[];
}

export function PhaseTable({ rows }: Props) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Latência por fase + sub-agente</h3>
        <p className="text-xs text-muted-foreground">p50 / p95 (ms) por fase analítica</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fase</TableHead>
            <TableHead>Sub-agente</TableHead>
            <TableHead className="text-right">N</TableHead>
            <TableHead className="text-right">p50 (ms)</TableHead>
            <TableHead className="text-right">p95 (ms)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                Sem dados ainda — colete spans rodando o A/B harness.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, idx) => (
              <TableRow key={`${row.phase}-${row.agent}-${idx}`}>
                <TableCell className="font-medium">{row.phase}</TableCell>
                <TableCell>{row.agent}</TableCell>
                <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                <TableCell className="text-right tabular-nums">{row.p50Ms.toFixed(0)}</TableCell>
                <TableCell className="text-right tabular-nums">{row.p95Ms.toFixed(0)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
