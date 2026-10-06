import { z } from "zod";

/** Field problems as `auth.validation.*` keys; empty when the credentials can be submitted. */
export type CredentialProblems = {
  readonly email?: "emailRequired" | "emailInvalid";
  readonly password?: "passwordRequired";
};

const EmailSchema = z.email();

/**
 * Client-side checks before calling Firebase (presence and email shape only). Password rules are
 * not checked here: a sign-in form must not hint at the account's password policy.
 */
export const validateCredentials = (input: { email: string; password: string }): CredentialProblems => {
  const email = input.email.trim();
  const emailProblem =
    email === "" ? "emailRequired" : EmailSchema.safeParse(email).success ? undefined : "emailInvalid";
  return {
    ...(emailProblem === undefined ? {} : { email: emailProblem }),
    ...(input.password === "" ? { password: "passwordRequired" as const } : {}),
  };
};
