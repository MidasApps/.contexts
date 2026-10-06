// What the Firebase JS SDK does against the Auth Emulator, over its REST API (emulator tests only).
// `localId` is present on sign-up only.
type SignInResponse = { readonly idToken: string; readonly localId?: string };

const call = async (method: string, body: Record<string, unknown>): Promise<SignInResponse> => {
  const host = process.env["FIREBASE_AUTH_EMULATOR_HOST"] ?? "";
  const response = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:${method}?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, returnSecureToken: true }),
  });
  if (!response.ok) throw new Error(`auth emulator ${method} failed with ${response.status}`);
  return (await response.json()) as SignInResponse;
};

/** `createUserWithEmailAndPassword`: a new account and its first ID token. */
export const signUpWithPassword = (email: string, password: string): Promise<SignInResponse> =>
  call("signUp", { email, password });

/** `signInWithCustomToken`: the ID token a custom token signs in to. */
export const signInWithCustomToken = (token: string): Promise<SignInResponse> =>
  call("signInWithCustomToken", { token });

const emulatorUrl = (path: string): string => `http://${process.env["FIREBASE_AUTH_EMULATOR_HOST"] ?? ""}${path}`;

const post = async <T>(path: string, body: Record<string, unknown>): Promise<T> => {
  const response = await fetch(emulatorUrl(`${path}?key=fake-api-key`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`auth emulator ${path} failed with ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
};

type MfaChallenge = {
  readonly mfaPendingCredential: string;
  readonly mfaInfo: readonly { readonly mfaEnrollmentId: string }[];
};

/**
 * `signInWithEmailAndPassword` for an account with an SMS second factor, then
 * `PhoneMultiFactorGenerator` with the code the Auth Emulator logged (SP1 spec §3.4: SMS
 * locally). The ID token carries `firebase.sign_in_second_factor = "phone"`.
 */
export const signInWithPasswordAndSms = async (args: {
  email: string;
  password: string;
  projectId: string;
}): Promise<SignInResponse> => {
  const challenge = await post<MfaChallenge>("/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword", {
    email: args.email,
    password: args.password,
    returnSecureToken: true,
  });
  const enrollment = challenge.mfaInfo[0];
  if (enrollment === undefined) throw new Error("account has no second factor");
  const started = await post<{ phoneResponseInfo: { sessionInfo: string } }>(
    "/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:start",
    {
      mfaPendingCredential: challenge.mfaPendingCredential,
      mfaEnrollmentId: enrollment.mfaEnrollmentId,
      phoneSignInInfo: { recaptchaToken: "emulator" },
    },
  );
  const codes = (await (
    await fetch(emulatorUrl(`/emulator/v1/projects/${args.projectId}/verificationCodes`))
  ).json()) as {
    verificationCodes: readonly { sessionInfo: string; code: string }[];
  };
  const code = codes.verificationCodes.find(
    (entry) => entry.sessionInfo === started.phoneResponseInfo.sessionInfo,
  )?.code;
  if (code === undefined) throw new Error("no SMS code logged by the emulator");
  return post<SignInResponse>("/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:finalize", {
    mfaPendingCredential: challenge.mfaPendingCredential,
    phoneVerificationInfo: { sessionInfo: started.phoneResponseInfo.sessionInfo, code },
  });
};
