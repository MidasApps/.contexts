import { describe, it, expect } from 'vitest';
import { tenantDatasetSegment } from '../tenants';

describe('tenantDatasetSegment', () => {
  // Havia aqui um `expect(TENANT_IDS).toEqual(['vila-rosa'])`. O teste passava
  // e não protegia nada: travava no código a lista de clientes, que é cadastro
  // da administração. A lista saiu; a normalização de nome ficou, porque essa
  // sim é regra do BigQuery e não do negócio.
  it('lowercase + hífen→underscore (BQ não aceita hífen em nome de dataset)', () => {
    expect(tenantDatasetSegment('vila-rosa')).toBe('vila_rosa');
    expect(tenantDatasetSegment('VILA-ROSA')).toBe('vila_rosa');
    expect(tenantDatasetSegment('Cliente-Novo-2')).toBe('cliente_novo_2');
  });

  it('troca TODOS os hífens, não só o primeiro', () => {
    expect(tenantDatasetSegment('a-b-c-d')).toBe('a_b_c_d');
  });

  it('ignora espaço em volta', () => {
    expect(tenantDatasetSegment('  vila-rosa  ')).toBe('vila_rosa');
  });
});
