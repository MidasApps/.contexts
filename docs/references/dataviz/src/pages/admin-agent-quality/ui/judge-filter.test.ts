import { describe, it, expect } from 'vitest';
import { filterByJudgeVersion } from './judge-filter';

const row = (scorerName: string, judgeModelVersion: string) => ({
  scorerName, judgeModelVersion, personaId: 'p', clientId: 'c', p50: 0.8, p95: 0.9, sampleSize: 3,
});
const ROWS = [row('a', 'judge-A'), row('b', 'judge-B'), row('c', 'judge-A')];

describe('filterByJudgeVersion', () => {
  it('keeps every version as an option after one is selected', () => {
    const r = filterByJudgeVersion({ rows: ROWS, driftVersions: [], selected: 'judge-A' });
    expect(r.options).toEqual(['judge-A', 'judge-B']);
    expect(r.visibleRows.map((x) => x.scorerName)).toEqual(['a', 'c']);
  });

  it('shows every row with no selection', () => {
    expect(filterByJudgeVersion({ rows: ROWS, driftVersions: [], selected: '' }).visibleRows).toHaveLength(3);
  });

  it('includes versions that only appear in drift, and the selected one', () => {
    const r = filterByJudgeVersion({ rows: ROWS, driftVersions: ['judge-C'], selected: 'judge-D' });
    expect(r.options).toEqual(['judge-A', 'judge-B', 'judge-C', 'judge-D']);
    expect(r.visibleRows).toEqual([]);
  });
});
