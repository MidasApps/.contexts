import { NextResponse } from 'next/server';
import { getDb } from '@/shared/lib/firebase/admin';

/**
 * Saúde do serviço, para o HEALTHCHECK do container e para diagnóstico.
 *
 * Achado R16 da revisão: o healthcheck apontava para `/`, que responde 200
 * mesmo com o Firestore fora do ar — um container quebrado era declarado
 * saudável e continuava recebendo tráfego.
 *
 * Também é onde a versão do código fica observável: sem `GIT_SHA` no ar não há
 * como responder "qual versão está rodando?" antes de decidir um rollback.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Injetado no build (`--build-arg GIT_SHA=$(git rev-parse HEAD)`). */
const GIT_SHA = process.env.GIT_SHA ?? 'desconhecido';
const APP_ENV = process.env.APP_ENV ?? process.env.NODE_ENV ?? 'desconhecido';

/**
 * Não autenticado de propósito: o healthcheck do container roda sem
 * credencial. Por isso o corpo NÃO expõe nada sensível — só o SHA do código,
 * o ambiente e se a dependência responde.
 */
export async function GET() {
  const start = Date.now();
  let firestoreOk = false;

  try {
    // Leitura barata e real: `limit(1)` num doc que pode nem existir. O que
    // importa é a ida à rede completar — é isso que distingue "processo de pé"
    // de "processo capaz de servir".
    await getDb().collection('clients').limit(1).get();
    firestoreOk = true;
  } catch {
    firestoreOk = false;
  }

  const body = {
    status: firestoreOk ? 'ok' : 'degraded',
    version: GIT_SHA,
    env: APP_ENV,
    checks: { firestore: firestoreOk ? 'ok' : 'fail' },
    durationMs: Date.now() - start,
  };

  // 503 quando degradado: é o que faz o orquestrador parar de mandar tráfego.
  return NextResponse.json(body, {
    status: firestoreOk ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
