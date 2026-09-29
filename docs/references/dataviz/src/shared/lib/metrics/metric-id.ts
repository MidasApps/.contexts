import 'server-only';

/**
 * Gera um MetricId `domain.slug` único na coleção `metrics/`, sufixando
 * `_2`, `_3`… em colisão. `domain` e `slug` devem ser identifiers válidos
 * (lowercase, [a-z0-9_], começando com letra) — responsabilidade do caller.
 * O id resultante NÃO codifica o dono (promoção mantém o id estável).
 */
export async function generateUniqueMetricId(
  db: FirebaseFirestore.Firestore,
  domain: string,
  slug: string,
): Promise<string> {
  const base = `${domain}.${slug}`;
  let candidate = base;
  let n = 1;
  while ((await db.collection('metrics').doc(candidate).get()).exists) {
    n += 1;
    candidate = `${base}_${n}`;
  }
  return candidate;
}
