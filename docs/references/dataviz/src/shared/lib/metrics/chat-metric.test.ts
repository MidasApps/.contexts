import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ genId: vi.fn(async () => 'chat.preco_medio_por_m') }));
vi.mock('./metric-id', () => ({ generateUniqueMetricId: h.genId }));
vi.mock('firebase-admin/firestore', () => ({ Timestamp: { now: () => ({ s: 0 }) } }));

import { saveChatMetric, slugFromLabel, nextVersion } from './chat-metric';

function makeDb() {
  const setMock = vi.fn(async (..._a: unknown[]) => undefined);
  const createMock = vi.fn(async (..._a: unknown[]) => undefined);
  const addMock = vi.fn(async (..._a: unknown[]) => undefined);
  const docMock = vi.fn(() => ({
    set: setMock,
    create: createMock,
    // Subcoleção `revisions` — o histórico.
    collection: () => ({ add: addMock }),
  }));
  return {
    setMock,
    createMock,
    addMock,
    docMock,
    db: { collection: () => ({ doc: docMock }) } as unknown as FirebaseFirestore.Firestore,
  };
}

beforeEach(() => h.genId.mockReset().mockResolvedValue('chat.preco_medio_por_m'));

const metric = {
  clientId: 'vila-rosa',
  label: 'Preço médio por m²',
  sql: 'SELECT AVG({unidades.valor}) AS value FROM {unidades} WHERE {filter.date_range:unidades.data_base_report}',
  requires: ['liquid-play.unidades.valor'],
  shape: 'scalar' as const,
  outputColumns: ['value'],
};

describe('saveChatMetric', () => {
  it('grava a métrica como do CLIENTE, com forma e colunas declaradas', async () => {
    const { db, createMock } = makeDb();

    const r = await saveChatMetric({ db, email: 'u@e.com', metric });

    expect(r).toEqual({ metricId: 'chat.preco_medio_por_m' });
    const saved = createMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(saved).toMatchObject({
      ownerClientId: 'vila-rosa',
      requires: ['liquid-play.unidades.valor'],
      recipe: { kind: 'sql', template: metric.sql },
      shape: 'scalar',
      outputColumns: ['value'],
      status: 'active',
      version: '1.0.0',
      // Origem: `chat` e `admin` carregam garantias diferentes (SQL de modelo
      // validado por dry-run × SQL revisado por gente). Sem o campo, o catálogo
      // não distingue as duas depois.
      origin: 'chat',
      createdBy: 'u@e.com',
      updatedBy: 'u@e.com',
    });
  });

  it('grava a linhagem quando a métrica nasce como variação de outra', async () => {
    const { db, createMock } = makeDb();

    await saveChatMetric({ db, email: 'u@e.com', metric: { ...metric, derivedFrom: 'covenants.emp_estoque' } });

    expect(createMock.mock.calls[0]![0]).toMatchObject({ derivedFrom: 'covenants.emp_estoque' });
  });

  it('cria com `create`, e não `set` — id novo sai de check-then-use', async () => {
    const { db, setMock, createMock } = makeDb();

    await saveChatMetric({ db, email: 'u@e.com', metric });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(setMock).not.toHaveBeenCalled();
  });

  /**
   * Propagar uma correção para todas as páginas que usam a métrica só é
   * aceitável se der para voltar. O que ela era vai para `revisions` antes de
   * deixar de existir.
   */
  it('arquiva o documento anterior antes de sobrescrever', async () => {
    const { db, addMock, setMock } = makeDb();
    const previous = { label: 'Antes', version: '1.0.0', recipe: { kind: 'sql', template: 'SELECT 0' } };

    await saveChatMetric({
      db,
      email: 'u@e.com',
      metric,
      metricId: 'chat.ja_existia',
      previousDoc: previous,
    });

    expect(addMock).toHaveBeenCalledWith(expect.objectContaining({ doc: previous, archivedBy: 'u@e.com' }));
    expect(setMock).toHaveBeenCalled();
  });

  it('criação não arquiva — não há o que arquivar', async () => {
    const { db, addMock } = makeDb();

    await saveChatMetric({ db, email: 'u@e.com', metric });

    expect(addMock).not.toHaveBeenCalled();
  });

  it('não carimba createdBy de novo na reescrita — apagaria o autor original', async () => {
    const { db, setMock } = makeDb();

    await saveChatMetric({ db, email: 'outro@e.com', metric, metricId: 'chat.ja_existia' });

    const saved = setMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(saved.updatedBy).toBe('outro@e.com');
    expect(saved).not.toHaveProperty('createdBy');
  });

  it('reescreve o documento indicado preservando createdAt e versão', async () => {
    const { db, setMock, docMock } = makeDb();

    await saveChatMetric({
      db,
      email: 'u@e.com',
      metric,
      metricId: 'chat.ja_existia',
      createdAt: { s: -1 },
      version: '1.0.3',
    });

    expect(h.genId).not.toHaveBeenCalled();
    expect(docMock).toHaveBeenCalledWith('chat.ja_existia');
    const saved = setMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(saved).toMatchObject({ version: '1.0.3', createdAt: { s: -1 } });
  });

  /**
   * Esta é a única porta em que uma recipe nasce de SQL de LLM e é persistida
   * sem passar pelo POST /api/metrics. Doc inválido não pode chegar ao banco:
   * ele só falharia na execução, longe da causa.
   */
  it('não persiste documento inválido — requires fora do formato de ref', async () => {
    const { db, setMock, createMock } = makeDb();

    const r = await saveChatMetric({ db, email: 'u@e.com', metric: { ...metric, requires: ['NaoEhUmaRef'] } });

    expect(r).toBeNull();
    expect(setMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('não persiste com template vazio — recipe inexecutável', async () => {
    const { db, createMock } = makeDb();

    expect(await saveChatMetric({ db, email: 'u@e.com', metric: { ...metric, sql: '' } })).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('não persiste com id fora do formato domain.slug', async () => {
    h.genId.mockResolvedValue('SemPonto');
    const { db, createMock } = makeDb();

    expect(await saveChatMetric({ db, email: 'u@e.com', metric })).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe('slugFromLabel', () => {
  it('tira acento, espaço e pontuação', () => {
    expect(slugFromLabel('Preço médio por m²')).toBe('preco_medio_por_m');
    expect(slugFromLabel('Índice de Recebível (pós-chaves)')).toBe('indice_de_recebivel_pos_chaves');
  });

  it('nunca começa por número — id de métrica exige letra', () => {
    expect(slugFromLabel('90 dias em atraso')).toBe('dias_em_atraso');
  });

  it('cai num nome utilizável quando não sobra nada', () => {
    expect(slugFromLabel('???')).toBe('metrica');
  });
});

describe('nextVersion', () => {
  it('incrementa o patch', () => {
    expect(nextVersion('1.0.0')).toBe('1.0.1');
    expect(nextVersion('2.3.9')).toBe('2.3.10');
  });

  it('qualquer coisa fora de forma vira 1.0.1', () => {
    expect(nextVersion(undefined)).toBe('1.0.1');
    expect(nextVersion('v1')).toBe('1.0.1');
  });
});

/**
 * ADR-0026 — a declaração de filtro sobrevive à reescrita.
 *
 * `saveChatMetric` reconstrói o documento do zero e grava com `set()`: o
 * que não está no rascunho some. `filterFields` nunca esteve no rascunho e
 * nenhuma tool o escreve — quem escreve é seed/admin. O resultado era que
 * pedir "corrige esse indicador" no chat apagava a declaração, o filtro da
 * página parava de recortar aquele bloco e ninguém era avisado: nem o log, nem
 * o usuário, nem o assistente, que anunciava a correção como feita.
 */
describe('saveChatMetric — o que a reescrita não pode destruir', () => {
  const WITH_FILTER = {
    label: 'Extrato Detalhado',
    requires: ['liquid-play.unidades.valor'],
    recipe: { kind: 'sql', template: 'SELECT 0' },
    filterFields: { banco: { expr: 'b.nome_reduzido', field: 'banco', label: 'Banco' } },
    version: '1.0.0',
  };

  it('mantém filterFields do documento anterior — o rascunho não sabe expressá-lo', async () => {
    const { db, setMock } = makeDb();

    await saveChatMetric({
      db,
      email: 'u@e.com',
      metric,
      metricId: 'chat.ja_existia',
      previousDoc: WITH_FILTER,
    });

    const saved = setMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(saved.filterFields).toEqual({
      banco: { expr: 'b.nome_reduzido', field: 'banco', label: 'Banco' },
    });
    // E a reescrita continua sendo reescrita: a recipe é a nova.
    expect(saved.recipe).toEqual({ kind: 'sql', template: metric.sql });
  });

  it('mantém a linhagem de quem nasceu variação', async () => {
    const { db, setMock } = makeDb();

    await saveChatMetric({
      db,
      email: 'u@e.com',
      metric,
      metricId: 'chat.ja_existia',
      previousDoc: { ...WITH_FILTER, derivedFrom: 'covenants.emp_estoque' },
    });

    expect(setMock.mock.calls[0]![0]).toMatchObject({ derivedFrom: 'covenants.emp_estoque' });
  });

  /*
   * O outro lado da moeda: preservar tudo transformaria "tirei a unidade" em
   * "a unidade voltou". Campo que o rascunho EXPRESSA é decisão de quem edita,
   * e continua apagável.
   */
  it('não ressuscita campo que o rascunho expressa e o usuário esvaziou', async () => {
    const { db, setMock } = makeDb();

    await saveChatMetric({
      db,
      email: 'u@e.com',
      metric,
      metricId: 'chat.ja_existia',
      previousDoc: {
        ...WITH_FILTER,
        unit: 'BRL',
        description: 'descrição antiga',
        outputColumns: ['bucket', 'value'],
        shape: 'series',
      },
    });

    const saved = setMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(saved.unit).toBeNull();
    expect(saved.description).toBeNull();
    expect(saved.outputColumns).toEqual(['value']);
    expect(saved.shape).toBe('scalar');
  });

  /*
   * Preservar é gravar, e o que se grava valida. Documento antigo cuja
   * declaração não passa mais no schema faz a reescrita inteira falhar — alto
   * e claro, com as issues no log — em vez de perder o campo por uma segunda
   * porta, que é justamente o defeito que este bloco corrige.
   */
  it('recusa a reescrita quando o filterFields preservado não valida', async () => {
    const { db, setMock } = makeDb();

    const r = await saveChatMetric({
      db,
      email: 'u@e.com',
      metric,
      metricId: 'chat.ja_existia',
      previousDoc: {
        ...WITH_FILTER,
        filterFields: { banco: { expr: 'b.nome_reduzido --', field: 'banco' } },
      },
    });

    expect(r).toBeNull();
    expect(setMock).not.toHaveBeenCalled();
  });

  it('criação segue sem documento anterior — nada a preservar, e usa create', async () => {
    const { db, createMock, setMock } = makeDb();

    const r = await saveChatMetric({ db, email: 'u@e.com', metric });

    expect(r).toEqual({ metricId: 'chat.preco_medio_por_m' });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(setMock).not.toHaveBeenCalled();
    expect(createMock.mock.calls[0]![0]).not.toHaveProperty('filterFields');
  });

  it('reescrita sem documento anterior não quebra — só não tem o que preservar', async () => {
    const { db, setMock } = makeDb();

    const r = await saveChatMetric({ db, email: 'u@e.com', metric, metricId: 'chat.ja_existia' });

    expect(r).toEqual({ metricId: 'chat.ja_existia' });
    expect(setMock.mock.calls[0]![0]).not.toHaveProperty('filterFields');
  });

  /*
   * Campo nulo não é declaração quebrada, é declaração inexistente: não há o
   * que preservar, e a reescrita não pode travar por causa disso. Declaração
   * MALFORMADA é o outro caso, no teste acima — esse falha alto.
   */
  it('filterFields nulo no documento anterior não trava a reescrita', async () => {
    const { db, setMock } = makeDb();

    const r = await saveChatMetric({
      db,
      email: 'u@e.com',
      metric,
      metricId: 'chat.ja_existia',
      previousDoc: { ...WITH_FILTER, filterFields: null },
    });

    expect(r).toEqual({ metricId: 'chat.ja_existia' });
    expect(setMock.mock.calls[0]![0]).not.toHaveProperty('filterFields');
  });
});
