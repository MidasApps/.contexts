import { describe, expect, it } from 'vitest';
import {
  mapBankRow,
  mapPluggyCategoryRow,
  parseDateBr,
  parseNumberBr,
  parseStringOrNull,
} from './aux-tables-parse';

describe('parseNumberBr', () => {
  it('parses plain integers', () => {
    expect(parseNumberBr('77')).toBe(77);
    expect(parseNumberBr('0')).toBe(0);
  });

  it('parses BR thousand/decimal separators', () => {
    expect(parseNumberBr('1.234')).toBe(1234);
    expect(parseNumberBr('12,5')).toBe(12.5);
  });

  it('maps n/a to null (BA - Bancos, Número_Código)', () => {
    expect(parseNumberBr('n/a')).toBeNull();
  });

  it('maps NaN/null tokens to null (BA - Pluggy export)', () => {
    expect(parseNumberBr('NaN')).toBeNull();
    expect(parseNumberBr('null')).toBeNull();
  });

  it('maps empty string to null, not 0 (Number("") === 0 is the trap)', () => {
    expect(parseNumberBr('')).toBeNull();
    expect(parseNumberBr('   ')).toBeNull();
  });

  it('maps null/undefined input to null', () => {
    expect(parseNumberBr(null)).toBeNull();
    expect(parseNumberBr(undefined)).toBeNull();
  });
});

describe('parseDateBr', () => {
  it('converts dd/mm/aaaa to ISO aaaa-mm-dd', () => {
    expect(parseDateBr('15/08/2008')).toBe('2008-08-15');
    expect(parseDateBr('22/04/2002')).toBe('2002-04-22');
  });

  it('maps empty/blank to null', () => {
    expect(parseDateBr('')).toBeNull();
  });

  it('maps unexpected formats to null instead of throwing', () => {
    expect(parseDateBr('2008-08-15')).toBeNull();
    expect(parseDateBr('not a date')).toBeNull();
  });
});

describe('parseStringOrNull', () => {
  it('trims surrounding whitespace', () => {
    expect(parseStringOrNull('  BANCO INTER  ')).toBe('BANCO INTER');
  });

  it('maps null-like tokens to null', () => {
    expect(parseStringOrNull('')).toBeNull();
    expect(parseStringOrNull('null')).toBeNull();
    expect(parseStringOrNull('NaN')).toBeNull();
  });
});

describe('mapBankRow', () => {
  it('maps a well-formed row (Banco Inter, numero_codigo=77)', () => {
    const row = mapBankRow({
      ISPB: '416968',
      Nome_Reduzido: 'BANCO INTER',
      Número_Código: '77',
      Participa_da_Compe: 'Sim',
      Acesso_Principal: 'RSFN',
      Nome_Extenso: 'Banco Inter S.A.',
      Início_da_Operação: '15/08/2008',
    });
    expect(row).toEqual({
      ispb: '416968',
      nome_reduzido: 'BANCO INTER',
      numero_codigo: 77,
      participa_compe: 'Sim',
      acesso_principal: 'RSFN',
      nome_extenso: 'Banco Inter S.A.',
      inicio_operacao: '2008-08-15',
    });
  });

  it('maps numero_codigo n/a to null (e.g. Selic/Bacen rows)', () => {
    const row = mapBankRow({
      ISPB: '38121',
      Nome_Reduzido: 'Selic',
      Número_Código: 'n/a',
      Participa_da_Compe: 'Não',
      Acesso_Principal: 'RSFN',
      Nome_Extenso: 'Banco Central do Brasil - Selic',
      Início_da_Operação: '22/04/2002',
    });
    expect(row.numero_codigo).toBeNull();
  });
});

describe('mapPluggyCategoryRow', () => {
  it('maps a well-formed taxonomy row', () => {
    const row = mapPluggyCategoryRow({
      index: '1',
      id: '1010000',
      description: 'Salary',
      descriptionTranslated: 'Salário',
      parentId: '1000000',
      parentDescription: 'Income',
      parentDescriptionTranslated: 'Renda',
    });
    expect(row).toEqual({
      idx: 1,
      id: 1010000,
      description: 'Salary',
      description_translated: 'Salário',
      parent_id: 1000000,
      parent_description: 'Income',
      parent_description_translated: 'Renda',
    });
  });

  it('preserves custom Liquid categories without index/id (last ~7 rows)', () => {
    const row = mapPluggyCategoryRow({
      index: 'NaN',
      id: 'NaN',
      description: 'Revenue',
      descriptionTranslated: 'Entrada',
      parentId: 'NaN',
      parentDescription: 'NaN',
      parentDescriptionTranslated: 'Entrada',
    });
    expect(row).toEqual({
      idx: null,
      id: null,
      description: 'Revenue',
      description_translated: 'Entrada',
      parent_id: null,
      parent_description: null,
      parent_description_translated: 'Entrada',
    });
  });

  it('preserves a custom row even when description itself is the literal token "null"', () => {
    const row = mapPluggyCategoryRow({
      index: 'NaN',
      id: 'NaN',
      description: 'null',
      descriptionTranslated: 'Categoria não encontrada',
      parentId: 'null',
      parentDescription: 'null',
      parentDescriptionTranslated: 'Categoria não encontrada',
    });
    expect(row).toEqual({
      idx: null,
      id: null,
      description: null,
      description_translated: 'Categoria não encontrada',
      parent_id: null,
      parent_description: null,
      parent_description_translated: 'Categoria não encontrada',
    });
  });
});
