import { sendGreeting } from "../../services/src/send-greeting";

export const greet = (): string => sendGreeting("hello");
