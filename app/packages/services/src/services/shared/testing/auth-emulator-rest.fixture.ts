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
export const signUpWithPassword = (email: string, password: string): Promise<SignInResponse> => call("signUp", { email, password });

/** `signInWithCustomToken`: the ID token a custom token signs in to. */
export const signInWithCustomToken = (token: string): Promise<SignInResponse> => call("signInWithCustomToken", { token });
