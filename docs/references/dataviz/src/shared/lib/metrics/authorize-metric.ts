import 'server-only';
import { isAdminEmail } from '@/shared/lib/runtime-config';
import { verifyClientAccess } from '@/shared/lib/api-auth';

export type MetricWriteIntent = 'create' | 'update' | 'delete' | 'promote';

/**
 * Autoriza escrita de métrica por dono. admin ⇒ sempre; promote ⇒ só admin;
 * global (ownerClientId null) ⇒ só admin; de cliente ⇒ delega a verifyClientAccess.
 */
export async function authorizeMetricWrite(
  email: string,
  ownerClientId: string | null,
  intent: MetricWriteIntent,
): Promise<{ allowed: boolean; status?: number; error?: string }> {
  if (isAdminEmail(email)) return { allowed: true };
  if (intent === 'promote') {
    return { allowed: false, status: 403, error: 'Apenas admin pode promover métricas' };
  }
  if (ownerClientId === null) {
    return { allowed: false, status: 403, error: 'Apenas admin gerencia métricas globais' };
  }
  return verifyClientAccess(email, ownerClientId);
}
