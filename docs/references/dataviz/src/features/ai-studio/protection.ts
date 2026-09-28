export type AiEntityType = 'agent' | 'skill' | 'workflow' | 'knowledgeBase';

export class ProtectionError extends Error {
  status = 422 as const;
  constructor(message: string) { super(message); this.name = 'ProtectionError'; }
}

export const LOCKED_FIELDS: Record<AiEntityType, string[]> = {
  agent: ['id', 'systemKey', 'kind'],
  skill: ['id', 'systemKey'],
  workflow: ['id', 'systemKey'],
  knowledgeBase: ['id', 'systemKey', 'clientId'],
};

export function isLockedField(type: AiEntityType, field: string): boolean {
  return LOCKED_FIELDS[type].includes(field);
}

export function assertDeletable(origin: 'system' | 'user'): void {
  if (origin === 'system') {
    throw new ProtectionError('Registro de sistema não pode ser excluído.');
  }
}

export function assertPatchAllowed(
  type: AiEntityType, origin: 'system' | 'user', updates: Record<string, unknown>,
): void {
  if (origin !== 'system') return;
  for (const field of Object.keys(updates)) {
    if (isLockedField(type, field)) {
      throw new ProtectionError(`Campo "${field}" é travado em registros de sistema.`);
    }
  }
}

export function stripLockedOnUpsert(
  type: AiEntityType,
  existingOrigin: 'system' | 'user',
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  if (existingOrigin !== 'system') return { ...incoming };
  const out = { ...incoming };
  for (const field of LOCKED_FIELDS[type]) {
    if (field in existing) out[field] = existing[field];
    else delete out[field];
  }
  return out;
}
