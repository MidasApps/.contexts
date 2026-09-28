/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/widgets/app-bar', () => ({
  AppBar: ({ pageTitle }: { pageTitle: string }) => <div data-testid="appbar">{pageTitle}</div>,
}));

vi.mock('@/shared/hooks/useOrchestratorMetrics', () => ({
  useOrchestratorMetrics: () => ({
    data: {
      phases: [],
      subAgents: [],
      retryRate: [],
      cacheHitRate: 0,
      experimental: true,
      generatedAt: new Date('2026-05-04T00:00:00Z').toISOString(),
    },
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

import { OrchestratorAnalyticsPage } from './OrchestratorAnalyticsPage';

describe('OrchestratorAnalyticsPage smoke', () => {
  it('renders without throwing and shows Experimental badge + flag toggles', () => {
    render(<OrchestratorAnalyticsPage />);
    expect(screen.getByText('Experimental')).toBeInTheDocument();
    expect(screen.getByLabelText('useImprovedSupervisor')).toBeInTheDocument();
    expect(screen.getByLabelText('useVertexPromptCache')).toBeInTheDocument();
    expect(screen.getByText(/Latência por fase/i)).toBeInTheDocument();
  });
});
