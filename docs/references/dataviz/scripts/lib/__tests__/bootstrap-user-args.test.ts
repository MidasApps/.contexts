import { describe, it, expect } from 'vitest';
import { parseBootstrapArgs, resolverIds } from '../bootstrap-user-args';

describe('parseBootstrapArgs', () => {
  it('lê os obrigatórios', () => {
    const a = parseBootstrapArgs(['--email=x@y.com', '--database=dataviz-dev']);
    expect(a.email).toBe('x@y.com');
    expect(a.database).toBe('dataviz-dev');
  });

  // As três flags decidem escrita real, sobrescrita e produção. Um typo que
  // caísse em `false` silenciosamente seria o pior tipo de erro aqui.
  it('flags só ligam com o nome exato', () => {
    const enabled = parseBootstrapArgs(['--dry-run', '--force', '--allow-prod']);
    expect([enabled.dryRun, enabled.force, enabled.allowProd]).toEqual([true, true, true]);

    const disabled = parseBootstrapArgs(['--dryrun', '--Force', '--allow_prod']);
    expect([disabled.dryRun, disabled.force, disabled.allowProd]).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('separa lista por vírgula e tolera espaço', () => {
    const a = parseBootstrapArgs(['--clients=vila-rosa, outro', '--groups=acesso-total']);
    expect(a.clients).toEqual(['vila-rosa', 'outro']);
    expect(a.groups).toEqual(['acesso-total']);
  });

  // A distinção carrega significado: ausente = "todos os que existirem";
  // vazio = lista explicitamente vazia. Colapsar os dois em `[]` faria o
  // usuário nascer sem cliente nenhum quando a flag fosse omitida.
  it('flag ausente é diferente de flag vazia', () => {
    expect(parseBootstrapArgs([]).clients).toBeUndefined();
    expect(parseBootstrapArgs(['--clients=']).clients).toEqual([]);
  });

  it('senha com caracteres especiais sobrevive ao parse', () => {
    expect(parseBootstrapArgs(['--password=a=b=c']).password).toBe('a=b=c');
  });
});

describe('resolverIds', () => {
  it('sem pedido, devolve tudo o que existe', () => {
    expect(resolverIds(undefined, ['vila-rosa'])).toEqual({ ok: true, ids: ['vila-rosa'] });
  });

  it('pedido válido passa intacto', () => {
    expect(resolverIds(['vila-rosa'], ['vila-rosa', 'outro'])).toEqual({
      ok: true,
      ids: ['vila-rosa'],
    });
  });

  // O caso que motiva a função: o Firestore aceitaria `vila-roza` sem reclamar,
  // gravaria a string e o usuário entraria sem enxergar nada.
  it('recusa id que não existe no banco, e diz qual', () => {
    expect(resolverIds(['vila-roza'], ['vila-rosa'])).toEqual({
      ok: false,
      missing: ['vila-roza'],
    });
  });

  it('recusa o lote inteiro quando só um id está errado', () => {
    const r = resolverIds(['vila-rosa', 'fantasma'], ['vila-rosa']);
    expect(r).toEqual({ ok: false, missing: ['fantasma'] });
  });

  it('banco vazio com pedido explícito é recusa, não silêncio', () => {
    expect(resolverIds(['vila-rosa'], [])).toEqual({ ok: false, missing: ['vila-rosa'] });
  });
});
