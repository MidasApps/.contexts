/**
 * Como os scripts falam com o Firestore — e como descobrem quais clientes
 * existem.
 *
 * Existe porque a alternativa é cada script repetir três coisas: resolver o
 * projeto GCP, montar a credencial e saber a lista de clientes. As duas
 * primeiras já divergiam entre scripts; a terceira vinha de um array escrito no
 * código, que é o que este arquivo elimina.
 */
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Projeto GCP alvo. Exigido explicitamente, e não deixado para o default.
 *
 * `tsx` não lê `.env.local` — nenhum script deste diretório lê. Sem a variável,
 * o firebase-admin cai no projeto do ADC (`gcloud config get-value project`),
 * que costuma ser OUTRO. O sintoma é um `5 NOT_FOUND` sem nome de projeto na
 * mensagem, e num script que escreve o estrago é pior que um erro: cria no
 * lugar errado.
 */
export function resolveProject(explicit?: string): string {
  const project = explicit
    ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    ?? process.env.GCP_PROJECT_ID;
  if (!project) {
    console.error(
      'Projeto GCP não resolvido. Passe --project=<id> ou exporte ' +
      'NEXT_PUBLIC_FIREBASE_PROJECT_ID (o valor está no seu .env.local).',
    );
    process.exit(1);
  }
  return project;
}

/** Espelha a seleção de credencial de `_firestore-admin.ts`: cert se houver, senão ADC. */
export function connectFirestore(databaseId: string, projectId: string): Firestore {
  if (getApps().length === 0) {
    if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    } else {
      initializeApp({ projectId });
    }
  }
  return getFirestore(databaseId);
}

/**
 * Ids dos clientes que existem — fonte única, lida do cadastro.
 *
 * Substitui os arrays de tenant que viviam em cada script. O problema deles não
 * era estarem errados no dia em que foram escritos: é que passavam a estar, em
 * silêncio, no dia seguinte a um cadastro na admin.
 */
export async function loadActiveClients(db: Firestore): Promise<string[]> {
  const snap = await db.collection('clients').get();
  return snap.docs.map((d) => d.id).sort();
}
