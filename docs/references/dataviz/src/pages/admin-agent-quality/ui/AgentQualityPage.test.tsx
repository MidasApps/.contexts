/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/widgets/app-bar', () => ({
  AppBar: ({ pageTitle }: { pageTitle: string }) => (
    <div data-testid="appbar">{pageTitle}</div>
  ),
}));

const evalRunsMock = vi.fn();
const judgeDriftMock = vi.fn();

vi.mock('@/shared/hooks/useEvalRuns', () => ({
  useEvalRuns: () => evalRunsMock(),
}));
vi.mock('@/shared/hooks/useJudgeDrift', () => ({
  useJudgeDrift: () => judgeDriftMock(),
}));

import { AgentQualityPage } from './AgentQualityPage';

describe('AgentQualityPage smoke', () => {
  it('renders heatmap rows when data present (no drift)', () => {
    evalRunsMock.mockReturnValue({
      data: {
        rows: [
          {
            scorerName: 'sql_correctness',
            personaId: 'cfo-securitizadora',
            clientId: 'OM',
            judgeModelVersion: 'gemini-2.5-pro',
            p50: 0.85,
            p95: 0.95,
            sampleSize: 12,
          },
        ],
        suite: 'smoke',
        days: 30,
        generatedAt: new Date().toISOString(),
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    judgeDriftMock.mockReturnValue({
      data: { rows: [], alertCount: 0, days: 30, generatedAt: new Date().toISOString() },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AgentQualityPage />);
    expect(screen.getByText('Experimental')).toBeInTheDocument();
    expect(screen.getByTestId('scorer-heatmap')).toBeInTheDocument();
    expect(screen.queryByTestId('drift-banner')).not.toBeInTheDocument();
    expect(screen.getByText('sql_correctness')).toBeInTheDocument();
  });

  it('shows drift banner when alertCount > 0', () => {
    evalRunsMock.mockReturnValue({
      data: { rows: [], suite: 'smoke', days: 30, generatedAt: '' },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    judgeDriftMock.mockReturnValue({
      data: {
        rows: [
          {
            detectedAt: '2026-05-01T00:00:00Z',
            judgeModelVersion: 'gemini-2.5-pro',
            scorerName: 'sql_correctness',
            fixtureId: 'gold-001',
            judgeScore: 0.7,
            humanBaseline: 0.5,
            delta: 0.2,
            alert: true,
            rolling3mAvgDelta: null,
          },
        ],
        alertCount: 1,
        days: 30,
        generatedAt: '',
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AgentQualityPage />);
    expect(screen.getByTestId('drift-banner')).toBeInTheDocument();
    expect(screen.getByText(/Drift detectado/i)).toBeInTheDocument();
  });
});
