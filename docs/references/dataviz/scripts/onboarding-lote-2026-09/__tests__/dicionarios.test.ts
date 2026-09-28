/* @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { AttributeDoc, EntityDoc } from '@/shared/schemas/data-contract';
import { Slug, SqlIdentifier } from '@/shared/schemas/identifier';
import { NOVOS_ATRIBUTOS, CORRECOES_DE_TIPO } from '../atributos-liquid-play.mjs';
import { ENTIDADES as ENTIDADES_BACKTEST, CAIXA_REAL } from '../atributos-backtest.mjs';
import { CLIENTES, SINONIMOS } from '../clientes.mjs';

/**
 * ─── Por que este teste existe ───
 *
 * O `seed.mjs` já verifica os dicionários contra o BigQuery: aborta se um
 * atributo declarado não existe em nenhum dataset, ou se o tipo divergir sem
 * estar na lista de divergências conhecidas. **Essa é a verificação contra a
 * REALIDADE.**
 *
 * O que ela não cobre é a verificação contra o CONTRATO DE CÓDIGO: nada garante
 * que o objeto que o seed grava caiba no `AttributeDoc` do Zod. E não cabe
 * confiar na gravação para descobrir — o Firestore aceita qualquer shape, e o
 * schema só é aplicado na leitura pelo app, longe do seed. Foi exatamente esse
 * o buraco que deixou `ltv_dirty` com `type: "FLOAT"` gravado em produção: um
 * valor que **não existe** no enum `FieldType`, que nada revalidou, e que só
 * apareceu quando a introspecção do BigQuery o contradisse.
 *
 * Então: o seed olha o dado, este teste olha o tipo. Os dois juntos fecham.
 */

interface Atributo {
  id: string;
  label: string;
  description: string;
  type: string;
  unit?: string;
  isKey?: boolean;
  required?: boolean;
}

const DICIONARIOS: Array<[string, Atributo[]]> = [
  ['liquid-play/contratos', NOVOS_ATRIBUTOS.contratos as Atributo[]],
  ['liquid-play/fluxo_caixa', NOVOS_ATRIBUTOS.fluxo_caixa as Atributo[]],
  ['liquid-play/pagamentos', NOVOS_ATRIBUTOS.pagamentos as Atributo[]],
  ['backtest/contratos', ENTIDADES_BACKTEST.contratos.atributos as Atributo[]],
  ['backtest/pagamentos', ENTIDADES_BACKTEST.pagamentos.atributos as Atributo[]],
];

describe('dicionários do lote 2026-09', () => {
  it.each(DICIONARIOS)('%s: todo atributo satisfaz AttributeDoc', (nome, atributos) => {
    const entityId = nome.split('/')[1]!;
    const invalidos: string[] = [];
    for (const a of atributos) {
      const r = AttributeDoc.safeParse({
        entityId,
        label: a.label,
        description: a.description,
        type: a.type,
        unit: a.unit ?? null,
        isKey: a.isKey ?? false,
        required: a.required ?? false,
        deprecated: false,
        deprecatedReason: null,
      });
      if (!r.success) {
        invalidos.push(`${a.id}: ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
      }
    }
    expect(invalidos).toEqual([]);
  });

  it.each(DICIONARIOS)('%s: id é SqlIdentifier e não repete', (_nome, atributos) => {
    const ruins = atributos.filter((a) => !SqlIdentifier.safeParse(a.id).success).map((a) => a.id);
    expect(ruins).toEqual([]);
    const ids = atributos.map((a) => a.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it.each(DICIONARIOS)('%s: description é útil, não placeholder', (_nome, atributos) => {
    /*
     * O contrato `liquid-play` já tem 126 atributos com `description: ""` e
     * `label` igual ao nome da coluna — semeados mecanicamente. Zod aceita: o
     * schema é `z.string().max(500)`, sem `.min()`. Aceitar de novo seria
     * repetir a lacuna que faz o agente de IA escolher entre `faixa_atraso_1`
     * e `faixa_atraso_2` por adivinhação, já que é a descrição do atributo que
     * alimenta o contexto semântico dele.
     */
    const pobres = atributos
      .filter((a) => !a.description || a.description.trim().length < 20)
      .map((a) => a.id);
    expect(pobres).toEqual([]);
  });

  it('entidades do backtest satisfazem EntityDoc', () => {
    for (const [id, def] of Object.entries(ENTIDADES_BACKTEST)) {
      expect(SqlIdentifier.safeParse(id).success).toBe(true);
      const r = EntityDoc.safeParse({ label: def.label, description: def.description });
      expect(r.success, `${id}: ${r.success ? '' : JSON.stringify(r.error.issues)}`).toBe(true);
    }
  });

  it('as correções de tipo apontam para valores válidos do enum', () => {
    for (const c of CORRECOES_DE_TIPO) {
      // O `de` é justamente um valor INVÁLIDO — é o defeito sendo corrigido.
      expect(AttributeDoc.shape.type.safeParse(c.de).success).toBe(false);
      expect(AttributeDoc.shape.type.safeParse(c.para).success).toBe(true);
    }
  });
});

describe('clientes do lote 2026-09', () => {
  it('id é Slug e o dataset deriva dele', () => {
    for (const c of CLIENTES) {
      expect(Slug.safeParse(c.id).success, `id inválido: ${c.id}`).toBe(true);
      const segmento = c.id.replace(/-/g, '_');
      for (const b of c.bindings) {
        /*
         * Trava a convenção `tenantDatasetSegment` (src/shared/config/tenants.ts):
         * o nome do dataset é o id do cliente com hífen→underscore, mais o
         * sufixo do produto. `construtora-sudoeste` → `construtora_sudoeste_monitor`.
         * Se algum dia um cliente precisar fugir da regra, o teste cobra a
         * decisão explícita em vez de deixar o desvio passar calado.
         */
        expect(b.datasetId.startsWith(`${segmento}_`), `${c.id}: ${b.datasetId}`).toBe(true);
      }
    }
  });

  it('não há id de cliente repetido', () => {
    const ids = CLIENTES.map((c) => c.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('cada binding aponta para um contrato conhecido', () => {
    const conhecidos = new Set(['liquid-play', 'backtest']);
    for (const c of CLIENTES) {
      for (const b of c.bindings) {
        expect(conhecidos.has(b.contractRef), `${c.id}: ${b.contractRef}`).toBe(true);
        expect(Slug.safeParse(b.productId).success).toBe(true);
      }
    }
  });

  it('sinônimo aponta para atributo que existe no contrato', () => {
    /*
     * Um sinônimo é uma afirmação: "esta coluna é aquele atributo". Se o lado
     * esquerdo não existir no vocabulário, o binding grava uma chave que
     * `resolveColumn` nunca consulta — falha silenciosa, do tipo que só
     * aparece como bloco vazio meses depois.
     */
    const vocabulario: Record<string, Set<string>> = {
      contratos: new Set((NOVOS_ATRIBUTOS.contratos as Atributo[]).map((a) => a.id)),
      fluxo_caixa: new Set((NOVOS_ATRIBUTOS.fluxo_caixa as Atributo[]).map((a) => a.id)),
      pagamentos: new Set((NOVOS_ATRIBUTOS.pagamentos as Atributo[]).map((a) => a.id)),
    };
    // `elegibilidade` vive no contrato ANTIGO, não nos atributos novos: por
    // isso a lista de conhecidos inclui o que o contrato já tinha.
    const jaNoContrato = new Set(['elegibilidade']);

    for (const [cliente, entidades] of Object.entries(SINONIMOS)) {
      for (const [entidade, mapa] of Object.entries(entidades as Record<string, Record<string, string>>)) {
        for (const [attr, colunaReal] of Object.entries(mapa)) {
          const existe = vocabulario[entidade]?.has(attr) || jaNoContrato.has(attr);
          expect(existe, `${cliente}/${entidade}: sinônimo para "${attr}", que não está no contrato`).toBe(true);
          expect(SqlIdentifier.safeParse(colunaReal).success, `coluna real inválida: ${colunaReal}`).toBe(true);
        }
      }
    }
  });

  it('a caixa real do backtest aponta para atributo declarado', () => {
    const declarados = new Set([
      ...ENTIDADES_BACKTEST.contratos.atributos.map((a: Atributo) => a.id),
      ...ENTIDADES_BACKTEST.pagamentos.atributos.map((a: Atributo) => a.id),
    ]);
    for (const [attr, colunaReal] of Object.entries(CAIXA_REAL)) {
      expect(declarados.has(attr), `CAIXA_REAL tem "${attr}", ausente do contrato`).toBe(true);
      expect(attr).toBe(attr.toLowerCase());
      expect(colunaReal).not.toBe(attr);
    }
  });
});
