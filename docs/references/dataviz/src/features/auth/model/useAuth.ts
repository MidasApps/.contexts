'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from '@/shared/lib/firebase/config';
import type { UserProfile } from './types';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
    error: null,
  });

  // Fetch or create user profile in Firestore
  const fetchProfile = useCallback(async (user: User): Promise<UserProfile | null> => {
    try {
      const db = getFirebaseDb();

      // 1. Try to find by Firebase UID
      const uidRef = doc(db, 'users', user.uid);
      const uidSnap = await getDoc(uidRef);
      if (uidSnap.exists()) {
        return uidSnap.data() as UserProfile;
      }

      // 2. Try to find existing doc by email (created by admin panel or seed)
      const email = user.email ?? '';
      if (email) {
        const q = query(collection(db, 'users'), where('email', '==', email));
        const results = await getDocs(q);
        if (!results.empty) {
          const existingDoc = results.docs[0];
          const profile = existingDoc.data() as UserProfile;
          // Update with current auth info
          await setDoc(existingDoc.ref, {
            uid: user.uid,
            displayName: user.displayName ?? profile.displayName,
            photoURL: user.photoURL ?? profile.photoURL,
          }, { merge: true });
          return { ...profile, uid: user.uid };
        }
      }

      // 3. No existing doc — create new profile with empty permissions
      const newProfile: UserProfile = {
        uid: user.uid,
        email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        groups: [],
        clientAccess: [],
        createdAt: new Date().toISOString(),
      };

      await setDoc(uidRef, newProfile);
      return newProfile;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuth();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Fetch profile but don't block auth if Firestore fails
        let profile = null;
        try {
          profile = await fetchProfile(user);
        } catch {
          // Firestore unavailable — continue without profile
        }
        setState({ user, profile, loading: false, error: null });
      } else {
        setState({ user: null, profile: null, loading: false, error: null });
      }
    });

    return unsubscribe;
  }, [fetchProfile]);

  const signInWithGoogle = useCallback(async () => {
    try {
      setState((s) => ({ ...s, error: null, loading: true }));
      const auth = getFirebaseAuth();
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao fazer login';
      setState((s) => ({ ...s, error: message, loading: false }));
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    try {
      setState((s) => ({ ...s, error: null, loading: true }));
      const auth = getFirebaseAuth();
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao fazer login';
      setState((s) => ({ ...s, error: message, loading: false }));
    }
  }, []);

  const signOut = useCallback(async () => {
    const auth = getFirebaseAuth();
    await firebaseSignOut(auth);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    try {
      setState((s) => ({ ...s, error: null }));
      const auth = getFirebaseAuth();
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao enviar e-mail de recuperação';
      setState((s) => ({ ...s, error: message }));
      throw err;
    }
  }, []);

  return {
    user: state.user,
    profile: state.profile,
    loading: state.loading,
    error: state.error,
    signInWithGoogle,
    signInWithEmail,
    resetPassword,
    signOut,
  };
}
