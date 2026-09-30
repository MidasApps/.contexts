/**
 * Audio format helpers of the voice routes: accepted upload types (the same set as
 * the `files` chat-attachment audio policy, plus mpeg), media-type sniffing of
 * synthesized audio, and the duration of a PCM WAV read from its header.
 */

export const ACCEPTED_AUDIO_TYPES: ReadonlySet<string> = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/mpeg"]);

/** `audio/webm;codecs=opus` → `audio/webm`; lowercase; `undefined` for a missing header. */
export const baseMediaType = (contentType: string | null): string | undefined => {
  const base = contentType?.split(";")[0]?.trim().toLowerCase();
  return base === undefined || base === "" ? undefined : base;
};

const ascii = (bytes: Uint8Array, start: number, length: number): string => Buffer.from(bytes.subarray(start, start + length)).toString("latin1");

/** Media type from magic bytes (RIFF/WAVE, OggS, ID3 or an MPEG frame sync, EBML, ftyp); `undefined` otherwise. */
export const sniffAudioMediaType = (bytes: Uint8Array): string | undefined => {
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") return "audio/wav";
  if (ascii(bytes, 0, 4) === "OggS") return "audio/ogg";
  if (ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)) return "audio/mpeg";
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "audio/webm";
  if (ascii(bytes, 4, 4) === "ftyp") return "audio/mp4";
  return undefined;
};

const WAV_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;

/**
 * Seconds of audio in a WAV, from the `fmt ` byte rate and the `data` chunk size.
 * `undefined` when the bytes are not a readable WAV (the caller then relies on the
 * duration the transcription model reports).
 */
export const wavDurationSeconds = (bytes: Uint8Array): number | undefined => {
  if (sniffAudioMediaType(bytes) !== "audio/wav") return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let byteRate: number | undefined;
  for (let offset = WAV_HEADER_BYTES; offset + CHUNK_HEADER_BYTES <= bytes.byteLength; ) {
    const id = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt " && offset + 16 <= bytes.byteLength - CHUNK_HEADER_BYTES) byteRate = view.getUint32(offset + CHUNK_HEADER_BYTES + 8, true);
    if (id === "data") return byteRate === undefined || byteRate === 0 ? undefined : size / byteRate;
    offset += CHUNK_HEADER_BYTES + size + (size % 2);
  }
  return undefined;
};
