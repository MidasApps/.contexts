import type { FileUrlSigner } from "../../application/ports/file-ports.ts";

/**
 * Bug/misconfiguration: the emulator signer outside `local`. Its URLs carry no
 * signature, so anywhere else they would be open write access.
 */
export class EmulatorSignerOutsideLocalError extends Error {
  readonly code = "EMULATOR_SIGNER_OUTSIDE_LOCAL";

  constructor(appEnv: string) {
    super(`the Storage Emulator URL signer is local only (APP_ENV=${appEnv})`);
    this.name = "EmulatorSignerOutsideLocalError";
  }
}

/**
 * URL "signer" for the Storage Emulator (`APP_ENV=local` only): the emulator
 * cannot verify V4 signatures, so uploads use its media-upload endpoint and
 * reads its download endpoint. Expiry and the size range are not enforced by
 * the emulator; `onObjectFinalized` checks the size again.
 * @param args.host `FIREBASE_STORAGE_EMULATOR_HOST` (`127.0.0.1:9199`).
 * @throws {EmulatorSignerOutsideLocalError} when `appEnv` is not `local`.
 */
export const createEmulatorUrlSigner = (args: {
  readonly appEnv: string;
  readonly host: string;
  readonly bucket: string;
}): FileUrlSigner => {
  if (args.appEnv !== "local") throw new EmulatorSignerOutsideLocalError(args.appEnv);
  const origin = `http://${args.host}`;
  const bucket = encodeURIComponent(args.bucket);
  return {
    signUpload: ({ path, contentType, sizeBytes, expiresAt }) =>
      Promise.resolve({
        method: "POST",
        url: `${origin}/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(path)}`,
        headers: { "content-type": contentType, "x-goog-content-length-range": `0,${sizeBytes}` },
        expiresAt: expiresAt.toISOString(),
      }),
    signRead: ({ path }) => Promise.resolve(`${origin}/storage/v1/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`),
  };
};
