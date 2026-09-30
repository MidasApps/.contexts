import { fileTypeFromBuffer } from "file-type";
import type { DetectContentType } from "../../application/ports/file-ports.ts";

/** Magic-byte detection with `file-type` (decision 0019 amendment); plain text has no signature (`undefined`). */
export const detectContentType: DetectContentType = async (sample) => (await fileTypeFromBuffer(sample))?.mime;
