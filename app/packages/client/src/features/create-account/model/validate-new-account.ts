import { z } from "zod";

/** Minimum password length the form asks for (Firebase's own floor is 6; projects may require more). */
export const MIN_PASSWORD_LENGTH = 8;

/** Field problems as `auth.validation.*` keys; empty when the account can be created. */
export type NewAccountProblems = {
  readonly name?: "nameRequired";
  readonly email?: "emailRequired" | "emailInvalid";
  readonly password?: "passwordRequired" | "passwordTooShort";
};

export type NewAccountInput = { readonly name: string; readonly email: string; readonly password: string };

const EmailSchema = z.email();

/**
 * Client-side checks before calling Firebase. Unlike sign-in, a new password may be described:
 * the user is choosing it, and the project's password policy still has the last word
 * (`WEAK_PASSWORD`).
 */
export const validateNewAccount = (input: NewAccountInput): NewAccountProblems => {
  const email = input.email.trim();
  const emailProblem = email === "" ? "emailRequired" : EmailSchema.safeParse(email).success ? undefined : "emailInvalid";
  const passwordProblem = input.password === "" ? "passwordRequired" : input.password.length < MIN_PASSWORD_LENGTH ? "passwordTooShort" : undefined;
  return {
    ...(input.name.trim() === "" ? { name: "nameRequired" as const } : {}),
    ...(emailProblem === undefined ? {} : { email: emailProblem }),
    ...(passwordProblem === undefined ? {} : { password: passwordProblem }),
  };
};
