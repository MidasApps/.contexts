import { describe, it, expect } from 'vitest';
import {
  DataContract,
  DataContractDoc,
  Entity,
  EntityDoc,
  Attribute,
  AttributeDoc,
} from '../data-contract';

const baseTimestamp = new Date('2026-05-11T00:00:00Z');

const validContract = {
  id: 'canonical',
  name: 'Liquid Canonical Contract',
  version: '1.0.0',
  status: 'active' as const,
  description: 'Vocabulário canônico de crédito imobiliário securitizado',
  createdAt: baseTimestamp,
  updatedAt: baseTimestamp,
};

const validEntity = {
  id: 'contratos',
  label: 'Contratos',
  description: 'Contratos de financiamento imobiliário',
  domain: 'credit',
  createdAt: baseTimestamp,
  updatedAt: baseTimestamp,
};

const validAttribute = {
  id: 'saldo_devedor',
  entityId: 'contratos',
  label: 'Saldo Devedor',
  description: 'Saldo devedor atualizado em BRL',
  type: 'NUMERIC' as const,
  unit: 'BRL',
  isKey: false,
  required: true,
  deprecated: false,
  deprecatedReason: null,
  createdAt: baseTimestamp,
  updatedAt: baseTimestamp,
};

describe('DataContract', () => {
  it('aceita contract válido', () => {
    expect(() => DataContract.parse(validContract)).not.toThrow();
  });

  it('exige version em semver x.y.z', () => {
    expect(() =>
      DataContract.parse({ ...validContract, version: '1.0' }),
    ).toThrow(/semver/);
    expect(() =>
      DataContract.parse({ ...validContract, version: 'v1' }),
    ).toThrow();
  });

  it('default de status é draft', () => {
    const { status, ...withoutStatus } = validContract;
    void status;
    const parsed = DataContractDoc.parse(withoutStatus);
    expect(parsed.status).toBe('draft');
  });

  it('rejeita status fora do enum', () => {
    expect(() =>
      DataContract.parse({ ...validContract, status: 'inactive' }),
    ).toThrow();
  });

  it('exige id em kebab-case (Slug)', () => {
    expect(() =>
      DataContract.parse({ ...validContract, id: 'Canonical' }),
    ).toThrow();
    expect(() =>
      DataContract.parse({ ...validContract, id: 'canonical_v2' }),
    ).toThrow();
  });
});

describe('Entity', () => {
  it('aceita entity válida', () => {
    expect(() => Entity.parse(validEntity)).not.toThrow();
  });

  it('domain é opcional', () => {
    const { domain, ...withoutDomain } = validEntity;
    void domain;
    expect(() => Entity.parse(withoutDomain)).not.toThrow();
  });

  it('rejeita id com hífen (não é SqlIdentifier válido)', () => {
    expect(() =>
      Entity.parse({ ...validEntity, id: 'fluxo-caixa' }),
    ).toThrow();
  });

  it('label deve ter no mínimo 1 char', () => {
    expect(() => Entity.parse({ ...validEntity, label: '' })).toThrow();
  });

  it('EntityDoc não exige id', () => {
    const { id, ...doc } = validEntity;
    void id;
    expect(() => EntityDoc.parse(doc)).not.toThrow();
  });
});

describe('Attribute', () => {
  it('aceita attribute válido', () => {
    expect(() => Attribute.parse(validAttribute)).not.toThrow();
  });

  it('default de deprecated é false', () => {
    const { deprecated, ...withoutDep } = validAttribute;
    void deprecated;
    const parsed = AttributeDoc.parse(withoutDep);
    expect(parsed.deprecated).toBe(false);
  });

  it('permite attribute deprecated com razão', () => {
    const parsed = Attribute.parse({
      ...validAttribute,
      deprecated: true,
      deprecatedReason: 'Substituído por ltv_originacao em 2026-04',
    });
    expect(parsed.deprecated).toBe(true);
    expect(parsed.deprecatedReason).toMatch(/Substituído/);
  });

  it('rejeita type fora do FieldType enum', () => {
    expect(() =>
      Attribute.parse({ ...validAttribute, type: 'DECIMAL' }),
    ).toThrow();
  });

  it('aceita unit null', () => {
    expect(() =>
      Attribute.parse({ ...validAttribute, unit: null }),
    ).not.toThrow();
  });

  it('entityId obrigatório (denormalizado)', () => {
    const { entityId, ...withoutEntity } = validAttribute;
    void entityId;
    expect(() => Attribute.parse(withoutEntity)).toThrow();
  });
});
