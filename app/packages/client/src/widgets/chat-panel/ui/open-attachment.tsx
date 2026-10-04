"use client";

import { getFileReadUrlEndpoint } from "@core/contracts";
import { ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "use-intl";
import type { AttachmentView } from "#/entities/message/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";

/**
 * Opens a file sent with a message: asks the files API for a short-lived signed read URL
 * (`GET /v1/files/{id}/read-url`, the same access as reading the file) and opens it in a new tab.
 * Nothing is fetched until the member asks; a failure says why in a toast.
 */
export function OpenAttachment({ file }: { file: AttachmentView }) {
  const t = useTranslations("chat.message");
  const callEndpoint = useCallEndpoint();
  const describe = useDescribeError();
  const [pending, setPending] = useState(false);
  const openFile = async (): Promise<void> => {
    setPending(true);
    try {
      const { data } = await callEndpoint(getFileReadUrlEndpoint, { params: { fileId: file.fileId } });
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (error: unknown) {
      notify.error(t("openAttachmentFailed", { name: file.name }), { description: describe(error).message });
    } finally {
      setPending(false);
    }
  };
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      pending={pending}
      aria-label={t("openAttachment", { name: file.name })}
      onClick={() => void openFile()}
    >
      <ExternalLinkIcon aria-hidden="true" />
    </Button>
  );
}
