import { describe, it, expect } from 'vitest';
import { Relation } from '../relation';

const base = {
  id: 'contrato-cliente',
  label: 'Contrato → Cliente',
  leftRef: 'contratos.contratos.cliente_id',
  rightRef: 'clientes.proponentes.id',
  cardinality: 'many-to-one',
  createdAt: 0,
  updatedAt: 0,
};

describe('Relation', () => {
  it('valida uma relação cross-contract bem formada', () => {
    expect(Relation.parse(base)).toMatchObject({ id: 'contrato-cliente', cardinality: 'many-to-one' });
  });
  it('rejeita ref que não é 3-part (contractId.entity.attr)', () => {
    expect(() => Relation.parse({ ...base, leftRef: 'contratos.cliente_id' })).toThrow();
  });
  it('rejeita cardinalidade fora do enum', () => {
    expect(() => Relation.parse({ ...base, cardinality: 'sometimes' })).toThrow();
  });
});
