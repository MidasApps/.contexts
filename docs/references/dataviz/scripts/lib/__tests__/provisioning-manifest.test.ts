import { describe, it, expect } from 'vitest';
import {
  CONFIG_COLLECTIONS,
  FORBIDDEN_COLLECTIONS,
  GLOBAL_COLLECTIONS,
  PRODUCTION_DATABASE,
} from '../provisioning-manifest';

describe('manifesto de provisionamento', () => {
  // A garantia central: um clone de produção não pode arrastar dado pessoal.
  // Se alguém adicionar `users` ou uma coleção de embeddings à lista de config,
  // este teste quebra antes de o export existir.
  it('nenhuma coleção proibida está na lista de exportação', () => {
    const exported = CONFIG_COLLECTIONS.map((c) => c.name);
    for (const forbidden of Object.keys(FORBIDDEN_COLLECTIONS)) {
      expect(exported, `"${forbidden}" carrega PII e não pode ser exportada`)
        .not.toContain(forbidden);
    }
  });

  it('as coleções com PII conhecida estão todas declaradas como proibidas', () => {
    for (const c of ['users', 'workingMemory', 'embeddingsDocs', 'embeddingsSql', 'embeddingsBlocks']) {
      expect(Object.keys(FORBIDDEN_COLLECTIONS)).toContain(c);
    }
  });

  it('toda proibição tem motivo escrito — a lista serve para ser lida', () => {
    for (const [name, motivo] of Object.entries(FORBIDDEN_COLLECTIONS)) {
      expect(motivo.length, `${name} sem motivo`).toBeGreaterThan(20);
    }
  });

  it('toda coleção de config declara por que faz parte do provisionamento', () => {
    for (const c of CONFIG_COLLECTIONS) {
      expect(c.reason.length, `${c.name} sem justificativa`).toBeGreaterThan(10);
    }
  });

  it('as globais são um subconjunto das exportadas', () => {
    const exported = new Set(CONFIG_COLLECTIONS.map((c) => c.name));
    for (const g of GLOBAL_COLLECTIONS) expect(exported).toContain(g);
  });

  it('clients não é global — é o eixo do recorte por cliente', () => {
    expect(GLOBAL_COLLECTIONS.has('clients')).toBe(false);
  });

  it('clients traz as subcoleções de relatório, senão o clone não tem páginas', () => {
    const clients = CONFIG_COLLECTIONS.find((c) => c.name === 'clients');
    expect(clients?.subcollections).toContain('groups');
    expect(clients?.subcollections).toContain('groups/reports');
  });

  it('dataContracts desce até attributes — o binding depende deles', () => {
    const dc = CONFIG_COLLECTIONS.find((c) => c.name === 'dataContracts');
    expect(dc?.subcollections).toContain('entities/attributes');
  });

  // A proteção do seed existe para o caso em que a configuração está errada;
  // derivá-la de env a apontaria para o banco errado exatamente aí.
  it('o id de produção é literal, não vem de env', () => {
    expect(PRODUCTION_DATABASE).toBe('dataviz');
  });

  it('não há coleção repetida', () => {
    const names = CONFIG_COLLECTIONS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
