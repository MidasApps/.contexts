import { describe, it, expect } from 'vitest';
import {
  loadBusinessContext,
  BusinessContextError,
  KNOWN_PERSONAS,
  KNOWN_ICPS,
} from './index';
import type { ClientBusinessProfile } from '@/shared/schemas/client';

/** Perfil como vem de `clients/{id}.businessProfile`. */
const profile: ClientBusinessProfile = {
  dominantProduct: 'Financiamento à produção',
  tablesPreferred: ['carteira.contratos'],
  partitionKey: 'data_base_report',
  granularity: 'contrato',
  glossaryOverrides: [],
  complianceConstraints: [],
};

describe('loadBusinessContext', () => {
  it('devolve o perfil recebido + persona + icp', () => {
    const ctx = loadBusinessContext({
      clientProfile: profile,
      personaId: 'cfo-securitizadora',
      icpId: 'fundo-cri-listado',
    });
    expect(ctx.client).toBe(profile);
    expect(ctx.persona.id).toBe('cfo-securitizadora');
    expect(ctx.icp?.id).toBe('fundo-cri-listado');
  });

  // O ponto da migração: cliente sem perfil cadastrado é caso legítimo, não
  // erro. Antes, um cliente que a admin criasse sem arquivo no bundle lançava
  // UNKNOWN_CLIENT e o agente ficava sem contexto nenhum.
  it('cliente SEM perfil não é erro — client vem null', () => {
    const ctx = loadBusinessContext({ clientProfile: null, personaId: 'controller' });
    expect(ctx.client).toBeNull();
    expect(ctx.persona.id).toBe('controller');
  });

  it('icpId is optional and returns icp: null', () => {
    const ctx = loadBusinessContext({ clientProfile: profile, personaId: 'controller' });
    expect(ctx.icp).toBeNull();
  });

  it('throws UNKNOWN_PERSONA for invalid personaId', () => {
    try {
      loadBusinessContext({ clientProfile: profile, personaId: 'foo-bar' });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as BusinessContextError).code).toBe('UNKNOWN_PERSONA');
    }
  });

  it('throws UNKNOWN_ICP for invalid icpId', () => {
    try {
      loadBusinessContext({ clientProfile: profile, personaId: 'controller', icpId: 'foo-bar' });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as BusinessContextError).code).toBe('UNKNOWN_ICP');
    }
  });

  // KNOWN_CLIENTS deixou de existir: cliente é cadastro da administração, não
  // catálogo compilado no bundle. Persona e ICP seguem estáticos.
  it('exports KNOWN_PERSONAS, KNOWN_ICPS arrays', () => {
    expect(KNOWN_PERSONAS.length).toBe(12);
    expect(KNOWN_ICPS.length).toBe(6);
  });
});
