import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function bcbResponse(data: Array<{ data: string; valor: string }>) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  } as Response;
}

describe('fetchSgsSeries', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    delete process.env.MACRO_LIVE;
    // reset module-level cache
  });

  it('hits correct URL pattern', async () => {
    fetchMock.mockResolvedValueOnce(bcbResponse([{ data: '01/04/2026', valor: '13.75' }]));
    const { fetchSgsSeries, __resetMacroCache } = await import('./bcb-sgs');
    __resetMacroCache();
    await fetchSgsSeries(432);
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toBe('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/12?formato=json');
  });

  it('parses BCB JSON shape (BR date → ISO, valor → number)', async () => {
    fetchMock.mockResolvedValueOnce(bcbResponse([{ data: '01/04/2026', valor: '13.75' }]));
    const { fetchSgsSeries, __resetMacroCache } = await import('./bcb-sgs');
    __resetMacroCache();
    const out = await fetchSgsSeries(432);
    expect(out).toEqual([{ data: '2026-04-01', valor: 13.75 }]);
  });

  it('throws on HTTP error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response);
    const { fetchSgsSeries, __resetMacroCache } = await import('./bcb-sgs');
    __resetMacroCache();
    await expect(fetchSgsSeries(432)).rejects.toThrow();
  });
});

describe('getMacroSnapshot', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    delete process.env.MACRO_LIVE;
  });

  it('composes 5 series with asOfDate and source=BCB_SGS', async () => {
    fetchMock.mockResolvedValue(bcbResponse([{ data: '01/04/2026', valor: '13.75' }]));
    const { getMacroSnapshot, __resetMacroCache } = await import('./bcb-sgs');
    __resetMacroCache();
    const snap = await getMacroSnapshot();
    expect(snap.source).toBe('BCB_SGS');
    expect(typeof snap.asOfDate).toBe('string');
    expect(Object.keys(snap.series).sort()).toEqual(['igpm12m', 'incc12m', 'ipca12m', 'selic', 'tr12m']);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('caches snapshot for 1 hour (only 1 round of fetches)', async () => {
    fetchMock.mockResolvedValue(bcbResponse([{ data: '01/04/2026', valor: '13.75' }]));
    const { getMacroSnapshot, __resetMacroCache } = await import('./bcb-sgs');
    __resetMacroCache();
    await getMacroSnapshot();
    fetchMock.mockClear();
    await getMacroSnapshot();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to fallback JSON when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const { getMacroSnapshot, __resetMacroCache } = await import('./bcb-sgs');
    __resetMacroCache();
    const snap = await getMacroSnapshot();
    expect(snap.source).toBe('fallback');
  });

  it('respects MACRO_LIVE=false without trying network', async () => {
    process.env.MACRO_LIVE = 'false';
    const { getMacroSnapshot, __resetMacroCache } = await import('./bcb-sgs');
    __resetMacroCache();
    const snap = await getMacroSnapshot();
    expect(snap.source).toBe('fallback');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
