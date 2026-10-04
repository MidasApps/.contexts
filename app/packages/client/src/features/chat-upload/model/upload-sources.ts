import { FALLBACK_MEDIA_TYPE, type UploadSource } from "../api/request-upload.ts";

/** Files picked, pasted or dropped, as the upload queue takes them (an unknown type gets the fallback). */
export const uploadSourcesOf = (files: FileList | readonly File[] | null): UploadSource[] =>
  [...(files ?? [])].map((file) => ({
    name: file.name,
    mediaType: file.type === "" ? FALLBACK_MEDIA_TYPE : file.type,
    sizeBytes: file.size,
    blob: file,
  }));
