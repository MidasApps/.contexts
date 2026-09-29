/**
 * Tipos do runner de evals (Sprint 3.D, Task 11).
 */
import type { EvalRun, BriefingFixture, Scorer } from '../scorers/types';

export type SuiteName = 'smoke' | 'full' | 'gold';

export interface RunOptions {
  suite: SuiteName;
  /** Concorrencia maxima para fixture x scorer (default 8). */
  concurrency?: number;
  /** Se true, nao persiste em BQ. */
  dryRun?: boolean;
  /** Sobrescreve resolucao default do dataset (test only). */
  loadDataset?: (suite: SuiteName) => BriefingFixture[];
  /** Sobrescreve registry de scorers (test only). */
  scorers?: Record<string, Scorer>;
  /** Versao do glossario (carimbada em metadata). */
  glossaryVersion?: string;
  /** Versao do regulatory pack. */
  regulatoryPackVersion?: string;
  /** Versao do judge model. */
  judgeModelVersion?: string;
}

export interface RunSummary extends EvalRun {
  totalFixtures: number;
  totalScorers: number;
}
