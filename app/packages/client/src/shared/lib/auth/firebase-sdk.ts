// The Firebase JS SDK functions the auth client uses, bound once so tests can inject fakes.
import { initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  EmailAuthProvider,
  getMultiFactorResolver,
  inMemoryPersistence,
  initializeAuth,
  multiFactor,
  onAuthStateChanged,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  reauthenticateWithCredential,
  RecaptchaVerifier,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
  TotpMultiFactorGenerator,
  updatePassword,
} from "firebase/auth";

export const FIREBASE_SDK = {
  initializeApp,
  initializeAuth,
  inMemoryPersistence,
  connectAuthEmulator,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  getMultiFactorResolver,
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  TotpMultiFactorGenerator,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
};

export type FirebaseSdk = typeof FIREBASE_SDK;
