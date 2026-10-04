"use client";

import type { ComponentProps, ReactNode } from "react";
import { type Components, Streamdown } from "streamdown";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { CodeBlock } from "#/shared/ui/ai/code-block.tsx";
import { isCitationHref, resolveSafeLink } from "./link-policy.ts";

export type SafeMarkdownProps = {
  /** Markdown written by a model (untrusted). */
  children: string;
  /** The text is still streaming: unfinished markdown (an open `**`, a half code fence) is closed. */
  streaming?: boolean | undefined;
  /** Renders citation `n` (1-based) for `#cite-<n>` links our own code wrote into the text. */
  renderCitation?: ((index: number) => ReactNode) | undefined;
  className?: string | undefined;
};

type AnchorProps = ComponentProps<"a"> & { node?: unknown };
type ImageProps = ComponentProps<"img"> & { node?: unknown };
type CodeProps = ComponentProps<"code"> & { node?: unknown };

const textOf = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return "";
};

/** Streamdown marks fenced code with `data-block`; inline code has no such prop. */
const isBlock = (props: CodeProps): boolean => "data-block" in props;

const NO_PLUGINS: [] = [];
const NO_LINK_SAFETY = { enabled: false } as const;

/** Blocks every href but absolute http(s) and our own citation fragments before rendering. */
const transformUrl = (url: string, key: string): string | null => {
  if (key !== "href") return null;
  if (isCitationHref(url) !== null) return url;
  return resolveSafeLink(url)?.href ?? null;
};

const PROSE = [
  "text-sm leading-relaxed break-words text-foreground",
  "[&_a]:underline [&_a]:underline-offset-4 [&_code]:font-mono [&_code]:text-body-sm",
  "[&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold",
  "[&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5",
  "[&_table]:w-full [&_table]:text-body [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&>*+*]:mt-3",
].join(" ");

/**
 * Markdown of a model answer, hardened (SP4 spec §6, decision 0035): raw HTML is never rendered
 * (no `rehype-raw`, HTML nodes skipped), links survive only as absolute http(s) with the real
 * host shown and `rel="noopener noreferrer nofollow"`, and images are not loaded (a model-chosen
 * URL would leak the reader's address and the conversation timing) — their alt text stays.
 */
export function SafeMarkdown({ children, streaming = false, renderCitation, className }: SafeMarkdownProps) {
  const t = useTranslations("chat.markdown");

  // Only the href and the text are taken from the markdown node: no other attribute passes through.
  const Anchor = ({ href, children: label }: AnchorProps) => {
    const citation = isCitationHref(href);
    if (citation !== null) return renderCitation === undefined ? null : <>{renderCitation(citation)}</>;
    const link = resolveSafeLink(href);
    if (link === null) return <span data-slot="markdown-unsafe-link">{label}</span>;
    const showsHost = typeof label === "string" && label.includes(link.host);
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer nofollow" data-slot="markdown-link">
        {label}
        {showsHost ? null : <span className="text-muted-foreground"> ({link.host})</span>}
        <span className="sr-only"> {t("newTab")}</span>
      </a>
    );
  };

  const Image = ({ alt }: ImageProps) => (
    <span data-slot="markdown-image" className="text-muted-foreground italic">
      {alt === undefined || alt === "" ? t("imageOmitted") : t("image", { alt })}
    </span>
  );

  // Fenced code becomes the kit block: the fence language, a labelled keyboard-scrollable region and
  // a copy button; still no highlighter (no wasm, decision 0016). Inline code stays a plain `code`.
  const Code = (props: CodeProps) => {
    const { className: codeClass, children: code } = props;
    if (!isBlock(props)) return <code className={codeClass}>{code}</code>;
    const language = /language-([\w+#.-]+)/u.exec(codeClass ?? "")?.[1];
    const text = textOf(code).replace(/\n$/u, "");
    return (
      <CodeBlock
        code={text}
        language={language}
        label={language === undefined ? t("code") : t("codeWithLanguage", { language })}
      />
    );
  };

  // Streamdown styles emphasis with spans; the native elements keep the semantics.
  const components: Components = { a: Anchor, img: Image, strong: "strong", em: "em", code: Code };

  return (
    <Streamdown
      data-slot="safe-markdown"
      className={cn(PROSE, className)}
      mode={streaming ? "streaming" : "static"}
      parseIncompleteMarkdown={streaming}
      skipHtml
      rehypePlugins={NO_PLUGINS}
      urlTransform={transformUrl}
      linkSafety={NO_LINK_SAFETY}
      controls={false}
      components={components}
    >
      {children}
    </Streamdown>
  );
}
