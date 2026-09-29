import { describe, it, expect } from 'vitest';
import { deriveContractRefs } from './derive-contract-refs';

/**
 * G2 — eliminar o default `'canonical'`: os contractRefs de um produto devem
 * ser DERIVADOS dos contratos das entities selecionadas, nunca um literal fixo.
 */
describe('deriveContractRefs', () => {
  const catalog = [
    { contractId: 'liquid-play', entityIds: ['contratos', 'pagamentos'] },
    { contractId: 'liquid-play-plus', entityIds: ['contratos', 'covenants'] },
    { contractId: 'external', entityIds: ['cep'] },
  ];

  it('retorna os contratos únicos que contêm as entities selecionadas, ordenados', () => {
    expect(deriveContractRefs(['pagamentos', 'cep'], catalog)).toEqual(['external', 'liquid-play']);
  });

  it('retorna vazio quando nada está selecionado', () => {
    expect(deriveContractRefs([], catalog)).toEqual([]);
  });

  it('ignora entity ids ausentes do catálogo (nunca inventa "canonical")', () => {
    expect(deriveContractRefs(['inexistente'], catalog)).toEqual([]);
  });

  it('marca todo contrato que compartilha um entity id selecionado', () => {
    expect(deriveContractRefs(['contratos'], catalog)).toEqual(['liquid-play', 'liquid-play-plus']);
  });

  it('deduplica quando várias entities selecionadas caem no mesmo contrato', () => {
    expect(deriveContractRefs(['contratos', 'pagamentos'], catalog)).toEqual([
      'liquid-play',
      'liquid-play-plus',
    ]);
  });
});
