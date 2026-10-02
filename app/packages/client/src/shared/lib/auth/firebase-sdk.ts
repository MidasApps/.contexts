// The Firebase JS SDK functions the auth client uses, bound once so tests can inject fakes.
import { initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
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
  sendPasswordResetEmail,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
  TotpMultiFactorGenerator,
  updatePassword,
  updateProfile,
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
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
};

export type FirebaseSdk = typeof FIREBASE_SDK;
