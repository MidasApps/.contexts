import 'server-only';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import type { Auth } from 'firebase-admin/auth';
import { DATAVIZ_DATABASE_ID } from '@/shared/lib/runtime-config';

/**
 * Firebase Admin bootstrap (idempotent).
 *
 * Em dev usa ADC (gcloud auth application-default login).
 * Em prod usa credenciais via env (FIREBASE_ADMIN_*).
 */
export function ensureAdminApp(): void {
  if (getApps().length > 0) return;

  if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    return;
  }

  initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
}

// Back-compat alias
export const ensureFirebaseAdmin = ensureAdminApp;

const firestoreCache = new Map<string, Firestore>();

/**
 * Retorna instância Firestore para um database específico.
 * Cacheia por databaseId para evitar reinicialização em hot-reload.
 */
export function getAdminFirestore(databaseId: string): Firestore {
  ensureAdminApp();
  const cached = firestoreCache.get(databaseId);
  if (cached) return cached;

  const db = getFirestore(databaseId);
  firestoreCache.set(databaseId, db);
  return db;
}

/**
 * Convenience helper — retorna o Firestore do banco dataviz (clients, users, schemas).
 * Usado pelo código centralizado de auth/clients pós-refactor.
 */
export function getDb(): Firestore {
  return getAdminFirestore(DATAVIZ_DATABASE_ID);
}

/**
 * Retorna o Auth do Admin SDK (server-side), garantindo bootstrap do app.
 * Usado para createUser/setCustomUserClaims/generatePasswordResetLink no
 * provisionamento de credencial (Abordagem A, ADR-0018).
 */
export function getAdminAuth(): Auth {
  ensureAdminApp();
  return getAuth();
}

// Auto-init on import para que callers de getDb() funcionem sem chamar ensureAdminApp() antes.
ensureAdminApp();
