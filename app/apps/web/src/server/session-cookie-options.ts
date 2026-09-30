/** Attributes of the `__session` cookie (decision 0007 §1), in Next's `cookies().set` shape. */
export type SessionCookieOptions = {
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: "lax";
  readonly path: "/";
  readonly maxAge: number;
};

/**
 * `HttpOnly; Secure; SameSite=Lax; Path=/`. `Secure` is dropped only for `APP_ENV=local`
 * served over plain http (browsers refuse Secure cookies there).
 */
export const sessionCookieOptions = (args: { appEnv: string; appUrl: string; maxAgeSeconds: number }): SessionCookieOptions => ({
  httpOnly: true,
  secure: !(args.appEnv === "local" && args.appUrl.startsWith("http://")),
  sameSite: "lax",
  path: "/",
  maxAge: args.maxAgeSeconds,
});
