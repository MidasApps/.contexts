/**
 * Sprint 3.D, Task 15 — admin endpoint para alertas de drift.
 * Bulk F5: backend migrado de BigQuery (`liquid_meta.judge_drift`) para
 * Firestore (collection `judgeDrift`).
 *
 * GET /api/admin/judge-drift?days=30
 *
 * Retorna alertas ativos (alert == true) nos últimos N dias (default 30).
 * Stub `{rows: []}` quando Firestore falha.
 */
import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, isAdminAuthOk } from '@/shared/lib/auth/require-admin';
import { getDb } from '@/shared/lib/firebase/admin';

export const runtime = 'nodejs';

export interface JudgeDriftRowDto {
  detectedAt: string;
  judgeModelVersion: string;
  scorerName: string;
  fixtureId: string;
  judgeScore: number;
  humanBaseline: number;
  delta: number;
  alert: boolean;
  rolling3mAvgDelta: number | null;
}

export interface JudgeDriftResponse {
  rows: JudgeDriftRowDto[];
  alertCount: number;
  stub?: boolean;
  generatedAt: string;
  days: number;
}

const DEFAULT_DAYS = 30;
const COLLECTION = 'judgeDrift';
const MAX_ROWS = 500;

interface JudgeDriftDoc {
  detectedAt?: Timestamp | { toDate: () => Date } | Date;
  judgeModelVersion?: string;
  scorerName?: string;
  fixtureId?: string;
  judgeScore?: number;
  humanBaseline?: number;
  delta?: number;
  alert?: boolean;
  rolling3mAvgDelta?: number | null;
}

function toIso(v: JudgeDriftDoc['detectedAt']): string {
  if (!v) return new Date(0).toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof (v as { toDate?: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date(0).toISOString();
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (!isAdminAuthOk(auth)) return auth;

  const url = new URL(req.url);
  const daysRaw = url.searchParams.get('days');
  const days = daysRaw ? Math.max(1, Number.parseInt(daysRaw, 10)) : DEFAULT_DAYS;
  const generatedAt = new Date().toISOString();

  try {
    const db = getDb();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const cutoffTs = Timestamp.fromDate(cutoff);

    const snap = await db
      .collection(COLLECTION)
      .where('alert', '==', true)
      .where('detectedAt', '>=', cutoffTs)
      .orderBy('detectedAt', 'desc')
      .limit(MAX_ROWS)
      .get();

    const rows: JudgeDriftRowDto[] = snap.docs.map((d) => {
      const data = d.data() as JudgeDriftDoc;
      return {
        detectedAt: toIso(data.detectedAt),
        judgeModelVersion: String(data.judgeModelVersion ?? ''),
        scorerName: String(data.scorerName ?? ''),
        fixtureId: String(data.fixtureId ?? ''),
        judgeScore: Number(data.judgeScore ?? 0),
        humanBaseline: Number(data.humanBaseline ?? 0),
        delta: Number(data.delta ?? 0),
        alert: Boolean(data.alert),
        rolling3mAvgDelta:
          data.rolling3mAvgDelta == null ? null : Number(data.rolling3mAvgDelta),
      };
    });

    const body: JudgeDriftResponse = {
      rows,
      alertCount: rows.length,
      generatedAt,
      days,
    };
    return NextResponse.json(body);
  } catch (err) {
    console.warn('[admin/judge-drift] Firestore falhou, retornando stub:', err);
    const body: JudgeDriftResponse = {
      rows: [],
      alertCount: 0,
      stub: true,
      generatedAt,
      days,
    };
    return NextResponse.json(body);
  }
}
