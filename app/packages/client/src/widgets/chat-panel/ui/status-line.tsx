"use client";

import { AlertTriangleIcon, CircleStopIcon, HandIcon, WifiOffIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { Shimmer } from "#/shared/ui/ai/shimmer.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Spinner } from "#/shared/ui/atoms/Spinner/Spinner.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/shared/ui/molecules/Alert/Alert.tsx";
import type { ChatFailure, ChatPhase } from "../model/use-chat-session.ts";

export type StatusLineProps = {
  phase: ChatPhase;
  failure: ChatFailure | undefined;
  /** Sends the failed turn again; shown for errors, a lost stream and a failed send while offline. */
  onRetry: () => void;
  className?: string | undefined;
};

type Line = {
  readonly text: string;
  readonly icon: ReactNode;
  readonly tone: "muted" | "warning";
  readonly visible: boolean;
  readonly retry: boolean;
};

const BUSY: ReadonlySet<ChatPhase> = new Set<ChatPhase>(["connecting", "resuming", "responding"]);

/**
 * The state of the conversation in words (SP4 spec §5.3). One polite live region, always
 * mounted, announces each transition once — "Respondendo…", "Resposta concluída.",
 * "Resposta interrompida." — instead of the streamed text itself. A failure is an alert with
 * the translated reason, the request reference and a retry.
 */
export function StatusLine({ phase, failure, onRetry, className }: StatusLineProps) {
  const t = useTranslations("chat");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");

  const lineOf = (): Line | null => {
    switch (phase) {
      case "connecting":
        return {
          text: t("status.connecting"),
          icon: <Spinner decorative className="size-3.5" />,
          tone: "muted",
          visible: true,
          retry: false,
        };
      case "resuming":
        return {
          text: t("status.resuming"),
          icon: <Spinner decorative className="size-3.5" />,
          tone: "muted",
          visible: true,
          retry: false,
        };
      case "responding":
        return {
          text: t("status.responding"),
          icon: <Spinner decorative className="size-3.5" />,
          tone: "muted",
          visible: true,
          retry: false,
        };
      case "finished":
        return { text: t("status.finished"), icon: null, tone: "muted", visible: false, retry: false };
      case "awaiting-approval":
        return {
          text: t("status.awaitingApproval"),
          icon: <HandIcon aria-hidden="true" className="size-3.5" />,
          tone: "warning",
          visible: true,
          retry: false,
        };
      case "stopped":
        return {
          text: t("status.stopped"),
          icon: <CircleStopIcon aria-hidden="true" className="size-3.5" />,
          tone: "muted",
          visible: true,
          retry: false,
        };
      case "lost":
        return {
          text: t("status.lost"),
          icon: <AlertTriangleIcon aria-hidden="true" className="size-3.5" />,
          tone: "warning",
          visible: true,
          retry: true,
        };
      case "offline":
        // Plain offline is already said by the shell banner and under the field; the line speaks
        // only when a send failed and can be retried.
        return failure === undefined
          ? null
          : {
              text: t("status.offline"),
              icon: <WifiOffIcon aria-hidden="true" className="size-3.5" />,
              tone: "warning",
              visible: true,
              retry: true,
            };
      case "error":
      case "idle":
        return null;
    }
  };

  const line = lineOf();
  const code = failure?.code;
  const reason =
    code !== undefined && tErrors.has(code as "INTERNAL_ERROR") ? tErrors(code as "INTERNAL_ERROR") : t("error.stream");

  return (
    <div data-slot="chat-status" data-phase={phase} className={cn("flex flex-col gap-2", className)}>
      <div
        className={cn(
          "flex min-h-5 items-center justify-between gap-3",
          line?.visible === true ? undefined : "sr-only",
        )}
      >
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "flex items-center gap-2 text-body-sm",
            line?.tone === "warning" ? "text-amber-foreground" : "text-muted-foreground",
          )}
        >
          {line?.icon}
          {line === null ? "" : BUSY.has(phase) ? <Shimmer>{line.text}</Shimmer> : line.text}
        </p>
        {line?.retry === true ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t("error.retry")}
          </Button>
        ) : null}
      </div>
      {phase === "error" ? (
        <Alert variant="destructive" data-slot="chat-error">
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle>{t("error.title")}</AlertTitle>
          <AlertDescription className="text-inherit">
            <p>{reason}</p>
            {failure?.requestId === undefined ? null : (
              <p className="font-mono text-caption">
                {tCommon("errorState.reference", { requestId: failure.requestId })}
              </p>
            )}
            <Button variant="outline" size="sm" onClick={onRetry} className="mt-1 text-foreground">
              {t("error.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
