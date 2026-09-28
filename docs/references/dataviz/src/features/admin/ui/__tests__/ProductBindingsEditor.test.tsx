/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProductBindingsEditor } from '../ProductBindingsEditor';

vi.mock('@/features/admin/model/useContractSchema', () => ({
  useContractSchema: () => ({
    schema: [{ entity: { id: 'contratos', label: 'Contratos' }, attributes: [{ id: 'saldo_devedor', type: 'float' }] }],
    loading: false, error: null, refetch: vi.fn(),
  }),
}));

const baseProduct = {
  id: 'prod', name: 'Prod', slug: 'prod', icon: 'box', color: '#fff', status: 'active',
  contractRefs: ['canonical'], entityRefs: ['contratos'], metricRefs: [], routes: [],
} as never;

function setup(onChange: ReturnType<typeof vi.fn>, onDetect: ReturnType<typeof vi.fn>) {
  return render(
    <ProductBindingsEditor
      bindings={[{ productId: 'prod', datasets: [{ id: 'd1', dataSourceId: 'src', datasetId: 'ds', contractRef: 'canonical', schemaBindings: {}, isPrimary: true }] }] as never}
      onChange={onChange as never}
      products={[baseProduct]}
      dataSources={[{ id: 'src', name: 'Src' }] as never}
      onDetectSchema={onDetect as never}
    />,
  );
}

describe('ProductBindingsEditor — detect aplica schemaBindings', () => {
  it('funde o binding detectado no dataset via onChange', async () => {
    const onChange = vi.fn();
    const onDetect = vi.fn().mockResolvedValue({ schemaBindings: { 'contratos.saldo_devedor': 'vl_saldo' }, coverage: [] });
    setup(onChange, onDetect);
    fireEvent.click(screen.getByText(/Auto-detect with AI/i));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const next = onChange.mock.calls.at(-1)![0] as Array<{ datasets: Array<{ schemaBindings: Record<string, string | null> }> }>;
    expect(next[0].datasets[0].schemaBindings).toEqual({ 'contratos.saldo_devedor': 'vl_saldo' });
  });
});
