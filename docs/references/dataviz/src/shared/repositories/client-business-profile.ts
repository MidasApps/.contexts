import 'server-only';
import { getDb } from '@/shared/lib/firebase/admin';
import { ClientBusinessProfile } from '@/shared/schemas/client';

/**
 * Perfil de negócio do cliente, lido de `clients/{id}.businessProfile`.
 *
 * Substitui os arquivos estáticos que viviam em
 * `src/shared/config/business-context/clients/<id>.json`. O motivo da troca não
 * foi estilo: aqueles arquivos escreviam nome de tabela do cliente no código —
 * uma segunda fonte de verdade ao lado de `productBindings`, que só se
 * descobria divergente quando o agente citava tabela inexistente — e obrigavam
 * commit + deploy para onboardar um cliente que a administração já cadastrara.
 *
 * Degrada graciosamente, como o `client-semantic-context` ao lado: cliente sem
 * perfil, doc ausente ou perfil malformado ⇒ `null`. O agente responde sem o
 * contexto específico, que é pior que ter, e muito melhor que erro na tela.
 */

const cache = new Map<string, { profile: ClientBusinessProfile | null; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;

export async function getClientBusinessProfile(
  clientId: string,
): Promise<ClientBusinessProfile | null> {
  const hit = cache.get(clientId);
  if (hit && Date.now() < hit.expiresAt) return hit.profile;

  let profile: ClientBusinessProfile | null = null;
  try {
    const snap = await getDb().collection('clients').doc(clientId).get();
    const raw = snap.exists ? snap.data()?.businessProfile : null;
    if (raw) {
      const parsed = ClientBusinessProfile.safeParse(raw);
      if (parsed.success) {
        profile = parsed.data;
      } else {
        // Perfil inválido é problema de cadastro, não de runtime: avisa e segue
        // sem ele. Lançar aqui derrubaria o chat inteiro por um campo torto.
        console.warn(
          `[businessProfile] clients/${clientId}.businessProfile inválido, ignorado:`,
          parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        );
      }
    }
  } catch (err) {
    console.warn(`[businessProfile] falha ao ler clients/${clientId}:`, err);
    return null; // não cacheia falha de IO — a próxima chamada tenta de novo
  }

  cache.set(clientId, { profile, expiresAt: Date.now() + TTL_MS });
  return profile;
}

/** Invalida o cache após escrita pela administração. */
export function invalidateBusinessProfileCache(clientId?: string): void {
  if (clientId) cache.delete(clientId);
  else cache.clear();
}
