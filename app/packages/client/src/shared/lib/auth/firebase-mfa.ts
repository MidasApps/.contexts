import type { Auth, MultiFactorError, MultiFactorInfo, MultiFactorResolver, TotpSecret } from "firebase/auth";
import { AuthError, type EnrolledFactor, type MfaChallenge, type MfaHint, type TotpEnrollment } from "./auth-port.ts";
import { guardAuth } from "./firebase-errors.ts";
import type { FirebaseSdk } from "./firebase-sdk.ts";

const toHint = (info: MultiFactorInfo): MfaHint => ({
  uid: info.uid,
  factor: info.factorId === "totp" ? "totp" : "phone",
  displayName: info.displayName ?? null,
  phoneNumber: "phoneNumber" in info && typeof info.phoneNumber === "string" ? info.phoneNumber : null,
});

const toEnrolledFactor = (info: MultiFactorInfo): EnrolledFactor => ({ ...toHint(info), enrolledAt: info.enrollmentTime === "" ? null : new Date(info.enrollmentTime).toISOString() });

/** The challenge of a sign-in that needs a second factor (`auth/multi-factor-auth-required`). */
export const toMfaChallenge = (sdk: FirebaseSdk, auth: Auth, error: MultiFactorError): MfaChallenge => {
  const resolver = sdk.getMultiFactorResolver(auth, error);
  return { hints: resolver.hints.map(toHint), handle: resolver };
};

// The handle is created by `toMfaChallenge` above; views only pass it back.
const resolverOf = (challenge: MfaChallenge): MultiFactorResolver => challenge.handle as MultiFactorResolver;

const hintOf = (challenge: MfaChallenge, hintUid: string): MultiFactorInfo => {
  const hint = resolverOf(challenge).hints.find((candidate) => candidate.uid === hintUid);
  if (hint === undefined) throw new AuthError("AUTH_FAILED");
  return hint;
};

/**
 * Invisible reCAPTCHA; in `local` the SDK skips it (`appVerificationDisabledForTesting`), so SMS
 * works against the Auth Emulator.
 */
const verifierFor = (sdk: FirebaseSdk, auth: Auth, container: HTMLElement) => new sdk.RecaptchaVerifier(auth, container, { size: "invisible" });

const currentUser = (auth: Auth) => {
  if (auth.currentUser === null) throw new AuthError("NOT_SIGNED_IN");
  return auth.currentUser;
};

const phoneAssertion = (sdk: FirebaseSdk, verificationId: string, code: string) =>
  sdk.PhoneMultiFactorGenerator.assertion(sdk.PhoneAuthProvider.credential(verificationId, code));

/** MFA flows of `AuthPort`: sign-in challenge and enrollment, TOTP and SMS (SP1 decision 0007). */
export const createFirebaseMfa = (sdk: FirebaseSdk, auth: Auth) => ({
  getEnrolledFactors: (): readonly EnrolledFactor[] =>
    auth.currentUser === null ? [] : sdk.multiFactor(auth.currentUser).enrolledFactors.map(toEnrolledFactor),
  unenrollMfa: (factorUid: string): Promise<void> => guardAuth(() => sdk.multiFactor(currentUser(auth)).unenroll(factorUid)),
  sendMfaSmsCode: (challenge: MfaChallenge, hintUid: string, container: HTMLElement): Promise<string> =>
    guardAuth(() =>
      new sdk.PhoneAuthProvider(auth).verifyPhoneNumber(
        { multiFactorHint: hintOf(challenge, hintUid), session: resolverOf(challenge).session },
        verifierFor(sdk, auth, container),
      ),
    ),
  resolveMfa: (challenge: MfaChallenge, answer: { hintUid: string; code: string; verificationId?: string }): Promise<void> =>
    guardAuth(async () => {
      const hint = hintOf(challenge, answer.hintUid);
      const assertion =
        hint.factorId === "totp"
          ? sdk.TotpMultiFactorGenerator.assertionForSignIn(hint.uid, answer.code)
          : phoneAssertion(sdk, answer.verificationId ?? "", answer.code);
      await resolverOf(challenge).resolveSignIn(assertion);
    }),
  startTotpEnrollment: (issuer: string): Promise<TotpEnrollment> =>
    guardAuth(async () => {
      const user = currentUser(auth);
      const secret = await sdk.TotpMultiFactorGenerator.generateSecret(await sdk.multiFactor(user).getSession());
      return { secretKey: secret.secretKey, uri: secret.generateQrCodeUrl(user.email ?? user.uid, issuer), handle: secret };
    }),
  finishTotpEnrollment: (enrollment: TotpEnrollment, code: string, displayName: string): Promise<void> =>
    guardAuth(() => {
      // The handle is the secret returned by `startTotpEnrollment`.
      const assertion = sdk.TotpMultiFactorGenerator.assertionForEnrollment(enrollment.handle as TotpSecret, code);
      return sdk.multiFactor(currentUser(auth)).enroll(assertion, displayName);
    }),
  startSmsEnrollment: (phoneNumber: string, container: HTMLElement): Promise<string> =>
    guardAuth(async () => {
      const session = await sdk.multiFactor(currentUser(auth)).getSession();
      return new sdk.PhoneAuthProvider(auth).verifyPhoneNumber({ phoneNumber, session }, verifierFor(sdk, auth, container));
    }),
  finishSmsEnrollment: (verificationId: string, code: string, displayName: string): Promise<void> =>
    guardAuth(() => sdk.multiFactor(currentUser(auth)).enroll(phoneAssertion(sdk, verificationId, code), displayName)),
});
