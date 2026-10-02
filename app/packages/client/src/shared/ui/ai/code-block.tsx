"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState, type ComponentProps } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";

export type CodeBlockProps = Omit<ComponentProps<"div">, "children"> & {
  code: string;
  /** Shown as a small tag ("json"); also the name of the scroll region. */
  language?: string | undefined;
  /** Accessible name of the code region (e.g. "Entrada da ferramenta"). */
  label: string;
};

const COPIED_MS = 2000;

/**
 * AI Elements `code-block` without syntax highlighting: upstream highlights with shiki, whose
 * regex engine is WebAssembly — the web CSP (decision 0016) has no `wasm-unsafe-eval`. Plain
 * mono text in a labelled, keyboard-scrollable region with a copy button.
 */
export function CodeBlock({ code, language, label, className, ...props }: CodeBlockProps) {
  const t = useTranslations("chat.elements");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = () => {
    // Clipboard may be denied (permissions, insecure context): the text stays selectable.
    navigator.clipboard.writeText(code).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };
  return (
    <div data-slot="code-block" className={cn("relative rounded-sm border border-border bg-muted", className)} {...props}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1">
        <span className="font-mono text-label text-muted-foreground-strong">{language ?? ""}</span>
        <Button variant="ghost" size="icon-xs" aria-label={copied ? t("copied") : t("copyCode")} onClick={copy}>
          {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
        </Button>
      </div>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be reachable by keyboard (WCAG 2.1.1) */}
      <pre role="region" aria-label={label} tabIndex={0} className="max-h-64 overflow-auto p-3 font-mono text-body-sm leading-relaxed text-foreground">
        <code>{code}</code>
      </pre>
      <span role="status" className="sr-only">
        {copied ? t("copied") : ""}
      </span>
    </div>
  );
}
