/** Shortest password the form accepts (Firebase's own policy may ask for more: `WEAK_PASSWORD`). */
export const MIN_PASSWORD_LENGTH = 8;

export type PasswordChange = { current: string; next: string; confirmation: string };

/** Problems per field, as `profile.security.password.errors.*` keys. */
export type PasswordChangeProblems = Partial<Record<keyof PasswordChange, "required" | "tooShort" | "sameAsCurrent" | "mismatch">>;

/** Client checks before any network call; the first problem field receives focus. */
export const validatePasswordChange = ({ current, next, confirmation }: PasswordChange): PasswordChangeProblems => {
  const problems: PasswordChangeProblems = {};
  if (current === "") problems.current = "required";
  if (next === "") problems.next = "required";
  else if (next.length < MIN_PASSWORD_LENGTH) problems.next = "tooShort";
  else if (next === current) problems.next = "sameAsCurrent";
  if (confirmation === "") problems.confirmation = "required";
  else if (next !== "" && confirmation !== next) problems.confirmation = "mismatch";
  return problems;
};
