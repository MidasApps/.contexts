"use client";

import type { ComponentProps } from "react";
import { type Components, Streamdown } from "streamdown";
import { useTranslations } from "use-intl";
import { parseRoute } from "#/shared/lib/router/parse-route.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { CodeBlock } from "#/shared/ui/ai/code-block.tsx";

type AnchorProps = ComponentProps<"a"> & { node?: unknown };
type CodeProps = ComponentProps<"code"> & { node?: unknown };
type ImageProps = ComponentProps<"img"> & { node?: unknown };

const textOf = (node: unknown): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return "";
};

/** Streamdown marks fenced code with `data-block`; inline code has no such prop. */
const isBlock = (props: CodeProps): boolean => "data-block" in props;

const isGuideHref = (href: string): boolean => href === "/docs" || href.startsWith("/docs/");
const isExternalHref = (href: string): boolean => /^https?:\/\//u.test(href);
/** Screenshots of the guide: the web app's public `/guide/` folder. */
const isGuideImage = (src: string): boolean => /^\/guide\/[\w-]+\.(?:jpg|png|webp)$/u.test(src);

/**
 * Keeps guide links, absolute http(s) links and the guide's own screenshots; drops every other
 * URL (the content is ours, still no surprises).
 */
const transformUrl = (url: string, key: string): string | null => {
  if (key === "src") return isGuideImage(url) ? url : null;
  if (key !== "href") return null;
  return isGuideHref(url) || isExternalHref(url) ? url : null;
};

const NO_PLUGINS: [] = [];
const NO_LINK_SAFETY = { enabled: false } as const;

const PROSE = [
  "text-body leading-relaxed break-words text-foreground",
  "[&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4",
  "[&_code]:font-mono [&_code]:text-body-sm",
  "[&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight",
  "[&_h2]:mt-10 [&_h2]:border-t [&_h2]:border-border [&_h2]:pt-6 [&_h2]:text-xl [&_h2]:font-semibold",
  "[&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold",
  "[&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:my-1",
  "[&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:text-body-sm",
  "[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top",
  "[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left",
  "[&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:bg-muted/40 [&_blockquote]:px-4 [&_blockquote]:py-2",
  "[&>*+*]:mt-4",
].join(" ");

/**
 * Markdown of a guide page (decision 0073). The text ships with the app, so links to other guide
 * pages stay inside the app (locale kept by the router), absolute http(s) links open in a new
 * tab and screenshots load from `/guide/`; raw HTML is still skipped and any other URL is dropped.
 */
export function DocsMarkdown({ children }: { children: string }) {
  const t = useTranslations("common.docs");

  const Anchor = ({ href, children: label }: AnchorProps) => {
    const route = href !== undefined && isGuideHref(href) ? parseRoute(href) : null;
    if (route !== null) return <RouteLink to={route}>{label}</RouteLink>;
    if (href === undefined || !isExternalHref(href)) return <span>{label}</span>;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {label}
        <span className="sr-only"> {t("newTab")}</span>
      </a>
    );
  };

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

  // A screenshot of the app: full column width, loaded when scrolled into view.
  const Image = ({ src, alt }: ImageProps) =>
    typeof src === "string" && isGuideImage(src) ? (
      <img
        src={src}
        alt={alt ?? ""}
        loading="lazy"
        width={1280}
        height={800}
        className="h-auto w-full rounded-lg border border-border shadow-sm"
      />
    ) : null;

  // Streamdown styles emphasis with spans; the native elements keep the semantics.
  const components: Components = { a: Anchor, img: Image, strong: "strong", em: "em", code: Code };

  return (
    <Streamdown
      data-slot="docs-markdown"
      className={PROSE}
      mode="static"
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
