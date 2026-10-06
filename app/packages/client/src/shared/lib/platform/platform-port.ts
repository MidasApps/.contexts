/** The host running the shared client (SP2 spec §2.2). */
export type PlatformPort = {
  readonly kind: "web" | "desktop";
  /** `""` on web (same origin), `VITE_API_URL` on desktop. */
  readonly apiBaseUrl: string;
};
