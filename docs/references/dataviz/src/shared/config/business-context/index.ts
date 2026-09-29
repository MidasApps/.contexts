import {
  PersonaProfileSchema,
  IcpProfileSchema,
  type PersonaProfile,
  type IcpProfile,
} from './schemas';
import type { ClientBusinessProfile } from '@/shared/schemas/client';

/* eslint-disable local/english-identifiers -- each binding mirrors its JSON file's
   persona/ICP slug, a data id (like template file names). */
import ceoIncorporadora from './personas/ceo-incorporadora.json';
import cfoSecuritizadora from './personas/cfo-securitizadora.json';
import diretorFiiCri from './personas/diretor-fii-cri.json';
import diretorCreditoBanco from './personas/diretor-credito-banco.json';
import gestorCreditoObra from './personas/gestor-credito-obra.json';
import gestorRepasse from './personas/gestor-repasse.json';
import controller from './personas/controller.json';
import gestorCarteiraSecuritizadora from './personas/gestor-carteira-securitizadora.json';
import analistaCredito from './personas/analista-credito.json';
import analistaCobranca from './personas/analista-cobranca.json';
import corretor from './personas/corretor.json';
import backofficeCartorario from './personas/backoffice-cartorario.json';

import incorporadoraMcmvGrande from './icps/incorporadora-mcmv-grande.json';
import incorporadoraMap from './icps/incorporadora-map.json';
import fundoCriListado from './icps/fundo-cri-listado.json';
import securitizadora from './icps/securitizadora.json';
import bancoGrande from './icps/banco-grande.json';
import fintechCredito from './icps/fintech-credito.json';
/* eslint-enable local/english-identifiers */

const PERSONA_JSONS = [
  ceoIncorporadora,
  cfoSecuritizadora,
  diretorFiiCri,
  diretorCreditoBanco,
  gestorCreditoObra,
  gestorRepasse,
  controller,
  gestorCarteiraSecuritizadora,
  analistaCredito,
  analistaCobranca,
  corretor,
  backofficeCartorario,
];

const PERSONAS: Record<string, PersonaProfile> = Object.fromEntries(
  PERSONA_JSONS.map((j) => {
    const p = PersonaProfileSchema.parse(j);
    return [p.id, p];
  }),
);

const ICP_JSONS = [
  incorporadoraMcmvGrande,
  incorporadoraMap,
  fundoCriListado,
  securitizadora,
  bancoGrande,
  fintechCredito,
];

const ICPS: Record<string, IcpProfile> = Object.fromEntries(
  ICP_JSONS.map((j) => {
    const p = IcpProfileSchema.parse(j);
    return [p.id, p];
  }),
);

export const KNOWN_PERSONAS = Object.keys(PERSONAS);
export const KNOWN_ICPS = Object.keys(ICPS);

export type BusinessContextErrorCode =
  | 'UNKNOWN_PERSONA'
  | 'UNKNOWN_ICP';

export class BusinessContextError extends Error {
  constructor(
    public readonly code: BusinessContextErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BusinessContextError';
  }
}

export interface BusinessContext {
  /**
   * Perfil do cliente, vindo de `clients/{id}.businessProfile` (administração).
   * `null` quando o cliente ainda não tem perfil — caso legítimo: o agente
   * responde sem o contexto específico em vez de falhar.
   */
  client: ClientBusinessProfile | null;
  persona: PersonaProfile;
  icp: IcpProfile | null;
}

/**
 * Compõe o contexto a partir dos catálogos ESTÁTICOS (persona, ICP) mais o
 * perfil do cliente, que o chamador busca no Firestore.
 *
 * O perfil entra por parâmetro em vez de lookup aqui porque ele mora no banco.
 * Persona e ICP continuam estáticos: são taxonomia de produto, não dado de
 * cliente — trocá-los é mudar o produto, não cadastrar.
 */
export function loadBusinessContext(args: {
  clientProfile: ClientBusinessProfile | null;
  personaId: string;
  icpId?: string | null;
}): BusinessContext {
  const client = args.clientProfile;
  const persona = PERSONAS[args.personaId];
  if (!persona) {
    throw new BusinessContextError('UNKNOWN_PERSONA', `personaId=${args.personaId}`);
  }
  let icp: IcpProfile | null = null;
  if (args.icpId) {
    const found = ICPS[args.icpId];
    if (!found) {
      throw new BusinessContextError('UNKNOWN_ICP', `icpId=${args.icpId}`);
    }
    icp = found;
  }
  return { client, persona, icp };
}
