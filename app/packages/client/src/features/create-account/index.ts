// Public API of the create-account feature (decision 0049).
export { MIN_PASSWORD_LENGTH, validateNewAccount, type NewAccountInput, type NewAccountProblems } from "./model/validate-new-account.ts";
export { CreateAccountForm } from "./ui/CreateAccountForm.tsx";
