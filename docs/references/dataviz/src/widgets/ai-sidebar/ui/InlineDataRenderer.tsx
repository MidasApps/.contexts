'use client';

import { FileText, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useAppStore } from '@/shared/stores/app-store';

interface InlineDataRendererProps {
  data: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function InlineDataRenderer({ data }: InlineDataRendererProps) {
  const debugMode = useAppStore((s) => s.debugMode);

  if (!isRecord(data)) return null;

  // ── Download link ──────────────────────────────────────────────
  if (typeof data.url === 'string' && typeof data.filename === 'string') {
    return (
      <div className="my-1.5 flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[12px]">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/50">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{data.filename}</p>
        </div>
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          download={data.filename}
          className="shrink-0 rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary/80 transition-colors hover:bg-primary/20 hover:text-primary"
        >
          Baixar
        </a>
      </div>
    );
  }

  // ── KPI highlight ─────────────────────────────────────────────
  // Detects: { kpiName, value, unit?, trend?: { direction, percent, comparedTo?, positiveIsGood? } }
  if (
    typeof data.kpiName === 'string' &&
    (typeof data.value === 'string' || typeof data.value === 'number')
  ) {
    const trend = isRecord(data.trend) ? data.trend : null;
    const direction = trend?.direction as string | undefined;
    const percent = trend?.percent as string | undefined;
    const comparedTo = trend?.comparedTo as string | undefined;
    const positiveIsGood = trend?.positiveIsGood as boolean | undefined;

    const isUp = direction === 'up';
    const isDown = direction === 'down';
    const isGood = positiveIsGood !== undefined
      ? (isUp && positiveIsGood) || (isDown && !positiveIsGood)
      : undefined;

    const TrendIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

    return (
      <div className="my-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
        <div className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">{data.kpiName}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-lg font-bold text-foreground">
            {String(data.value)}
          </span>
          {typeof data.unit === 'string' && (
            <span className="text-[11px] text-muted-foreground/80">{data.unit}</span>
          )}
        </div>
        {trend && percent && (
          <div className={cn(
            'mt-1 flex items-center gap-1 text-[11px]',
            isGood === true && 'text-emerald-400/70',
            isGood === false && 'text-destructive/70',
            isGood === undefined && 'text-muted-foreground/80',
          )}>
            <TrendIcon className="h-3 w-3" strokeWidth={2} />
            <span>{percent}</span>
            {comparedTo && <span className="text-muted-foreground/60">vs {comparedTo}</span>}
          </div>
        )}
      </div>
    );
  }

  // ── Data table ─────────────────────────────────────────────────
  if (Array.isArray(data.data) && data.data.length > 0 && isRecord(data.data[0])) {
    const rows = data.data as Record<string, unknown>[];
    const headers = Object.keys(rows[0]);

    // Hide internal agent tool-result metadata unless debug mode is on
    const looksLikeToolInternals = headers.some((h) =>
      ['toolCallId', 'toolName', 'type'].includes(h)
    ) && rows.some((r) => r.type === 'tool-result' || r.type === 'tool-call');
    if (looksLikeToolInternals && !debugMode) return null;
    const displayRows = rows.slice(0, 10);
    const totalRows = rows.length;

    return (
      <div className="my-2 overflow-hidden rounded-lg border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                {headers.map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-2.5 py-1.5 text-left font-medium text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) => (
                <tr key={i} className="border-t border-border odd:bg-muted/30">
                  {headers.map((h) => (
                    <td
                      key={h}
                      className="whitespace-nowrap px-2.5 py-1.5 text-muted-foreground"
                    >
                      {row[h] == null ? '—' : String(row[h])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalRows > 0 && (
          <div className="border-t border-border px-2.5 py-1.5 text-[10px] text-muted-foreground/60">
            Mostrando {displayRows.length} de {totalRows} {totalRows === 1 ? 'resultado' : 'resultados'}
          </div>
        )}
      </div>
    );
  }

  // Fall through — let caller render as markdown
  return null;
}
