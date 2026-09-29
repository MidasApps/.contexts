import { describe, it, expect, vi, beforeEach } from 'vitest';

const recordSpanMock = vi.fn();
vi.mock('@/shared/lib/telemetry/record-span', () => ({
  recordSpan: (opts: unknown, fn: () => unknown) => {
    recordSpanMock(opts);
    return Promise.resolve(fn());
  },
}));

describe('deriveBqmlDataset', () => {
  it('normaliza case e hífen (BQ não aceita hífen em nome de dataset)', async () => {
    const { deriveBqmlDataset } = await import('./multi-tenancy');
    expect(deriveBqmlDataset('vila-rosa')).toBe('dataviz_bqml_vila_rosa');
    expect(deriveBqmlDataset('VILA-ROSA')).toBe('dataviz_bqml_vila_rosa');
  });

  // O que esta função precisa impedir é que o id escape do nome do dataset.
  // Todo caractere abaixo é um jeito de fazer isso: ponto abre outro dataset,
  // crase fecha o identificador, barra e espaço quebram a referência.
  it('recusa id que escaparia do nome do dataset', async () => {
    const { deriveBqmlDataset } = await import('./multi-tenancy');
    for (const dangerous of [
      'foo; DROP --',
      'proj.outro_dataset',
      'vila`rosa',
      'vila rosa',
      'vila/rosa',
      'vila_rosa',      // underscore não é slug — o id canônico usa hífen
      '-vila',          // slug começa por letra
      '9vila',
      '',
    ]) {
      expect(() => deriveBqmlDataset(dangerous), dangerous).toThrow(/Invalid client id/);
    }
  });

  // Deixou de ser allowlist: cliente cadastrado na admin funciona sem deploy.
  // O isolamento entre tenants não vinha daqui — vem de
  // `assertClientMatchesDataset`, coberto abaixo.
  it('aceita qualquer id em formato de slug, sem lista no código', async () => {
    const { deriveBqmlDataset } = await import('./multi-tenancy');
    expect(deriveBqmlDataset('cliente-novo')).toBe('dataviz_bqml_cliente_novo');
    expect(deriveBqmlDataset('a')).toBe('dataviz_bqml_a');
  });
});

describe('assertClientMatchesDataset', () => {
  beforeEach(() => recordSpanMock.mockReset());

  it('resolves when client matches model_ref', async () => {
    const { assertClientMatchesDataset } = await import('./multi-tenancy');
    expect(() => assertClientMatchesDataset('vila-rosa', 'dataviz_bqml_vila_rosa.bqml_x')).not.toThrow();
    // Era 'proj.…': 'proj' não é id de projeto GCP válido (6-30 chars). O ref
    // agora é validado inteiro, ponta a ponta, e recomposto por quoteTableRef.
    expect(() => assertClientMatchesDataset('vila-rosa', 'proj-teste.dataviz_bqml_vila_rosa.bqml_x')).not.toThrow();
  });

  it('throws on cross-tenant access and emits security event', async () => {
    const { assertClientMatchesDataset } = await import('./multi-tenancy');
    // `om` não é mais tenant, mas o model_ref é string livre vinda da IA —
    // é exatamente o caso de um modelo de outro dataset chegando ao cliente
    // errado, que este gate existe para barrar.
    expect(() => assertClientMatchesDataset('vila-rosa', 'dataviz_bqml_om.bqml_x')).toThrow(
      /Cross-tenant model access denied/,
    );
    expect(recordSpanMock).toHaveBeenCalled();
  });

  it('throws on non-bqml dataset', async () => {
    const { assertClientMatchesDataset } = await import('./multi-tenancy');
    expect(() => assertClientMatchesDataset('vila-rosa', 'liquid_play_vila_rosa.bqml_x')).toThrow();
  });
});
