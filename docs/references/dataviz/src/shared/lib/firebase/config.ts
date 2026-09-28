import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { DATAVIZ_DATABASE_ID } from '@/shared/lib/runtime-config';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const useEmulator = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === 'true';

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
    if (useEmulator) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
  }
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (!db) {
    db = DATAVIZ_DATABASE_ID
      ? getFirestore(getFirebaseApp(), DATAVIZ_DATABASE_ID)
      : getFirestore(getFirebaseApp());
    if (useEmulator) {
      connectFirestoreEmulator(db, '127.0.0.1', 8181);
    }
  }
  return db;
}
