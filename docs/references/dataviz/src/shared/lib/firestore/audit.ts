import { Timestamp } from 'firebase-admin/firestore';

/**
 * Campos de autoria e versão de formato para toda escrita administrativa.
 *
 * Achado R19: nenhuma coleção guardava quem criou ou alterou o documento, nem
 * qual formato ele segue. Sem isso, "quem mudou esta permissão?" não tem
 * resposta — e num produto onde o documento de usuário decide acesso a dado de
 * carteira, essa pergunta é feita depois de um incidente, quando já é tarde
 * para instrumentar.
 *
 * ─── Por que `createdBy` só na criação ──────────────────────────────────────
 * Sob `set(..., { merge: true })`, reescrever `createdBy` a cada update apagaria
 * o autor original — que é justamente o dado que não se recupera. O chamador
 * informa se o documento é novo; a decisão fica explícita, não implícita.
 */

/** Versão corrente do formato dos documentos escritos pela administração. */
export const SCHEMA_VERSION = 2;

export interface AuditFields {
  updatedAt: Timestamp;
  updatedBy: string;
  schemaVersion: number;
  createdAt?: Timestamp;
  createdBy?: string;
}

/**
 * @param email  Quem está escrevendo. Vem do token já verificado — nunca do
 *               corpo da requisição, que é controlado pelo cliente.
 * @param isNew  `true` quando o documento não existia. Só então `createdBy` e
 *               `createdAt` são gravados.
 */
export function auditFields(email: string, isNew: boolean, now = Timestamp.now()): AuditFields {
  return {
    updatedAt: now,
    updatedBy: email,
    schemaVersion: SCHEMA_VERSION,
    ...(isNew ? { createdAt: now, createdBy: email } : {}),
  };
}
