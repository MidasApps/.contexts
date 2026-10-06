import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DocsNavGroup, DocsNavPage } from "@core/client/views/docs";

/** The guide is written in the source locale only; other locales read it with a notice (decision 0073). */
export const DOCS_CONTENT_LOCALE = "pt-BR";

/** Every page of the guide, in reading order. A page's file is `content/docs/<locale>/<slug>.md` ("" → `index.md`). */
export const DOCS_GROUPS: readonly DocsNavGroup[] = [
  {
    title: "Comece aqui",
    pages: [
      { slug: "", title: "Visão geral" },
      { slug: "getting-started", title: "Primeiros passos" },
    ],
  },
  {
    title: "Organização",
    pages: [
      { slug: "organizations", title: "Organizações e projetos" },
      { slug: "members", title: "Membros e convites" },
      { slug: "roles", title: "Papéis e permissões" },
      { slug: "units", title: "Unidades" },
      { slug: "audit-log", title: "Auditoria" },
    ],
  },
  {
    title: "Inteligência artificial",
    pages: [
      { slug: "chat", title: "Assistente (chat)" },
      { slug: "agents", title: "Agentes e habilidades" },
      { slug: "knowledge", title: "Base de conhecimento" },
      { slug: "connectors", title: "Conectores" },
    ],
  },
  {
    title: "Operações",
    pages: [
      { slug: "workflows", title: "Fluxos e agendamentos" },
      { slug: "approvals", title: "Aprovações" },
      { slug: "usage", title: "Uso e orçamento" },
      { slug: "traces", title: "Rastros" },
      { slug: "evals", title: "Avaliações" },
      { slug: "flags", title: "Recursos (flags)" },
    ],
  },
  {
    title: "Acesso e integrações",
    pages: [
      { slug: "api-keys", title: "Chaves de API e integração" },
      { slug: "devices", title: "Dispositivos e app desktop" },
      { slug: "modules", title: "Módulos" },
    ],
  },
  {
    title: "Sua conta",
    pages: [{ slug: "profile", title: "Seu perfil" }],
  },
  {
    title: "Administração da plataforma",
    pages: [
      { slug: "admin", title: "Visão geral da administração" },
      { slug: "admin-customers", title: "Clientes" },
      { slug: "admin-ai", title: "Inteligência artificial" },
      { slug: "admin-operations", title: "Operações" },
    ],
  },
  {
    title: "Referência",
    pages: [{ slug: "glossary", title: "Glossário" }],
  },
];

/** Where the guide's Markdown lives: the web app's folder (`next dev`/`next start` run there). */
export const DOCS_CONTENT_DIR = path.join(process.cwd(), "content", "docs");

/** The guide page with this slug, or `undefined`; only these slugs ever reach the file system. */
export const findDocsPage = (slug: string): DocsNavPage | undefined =>
  DOCS_GROUPS.flatMap((group) => group.pages).find((page) => page.slug === slug);

/** Path of a page's Markdown file, from a slug `findDocsPage` returned. */
export const docsFileOf = (page: DocsNavPage): string =>
  path.join(DOCS_CONTENT_DIR, DOCS_CONTENT_LOCALE, `${page.slug === "" ? "index" : page.slug}.md`);

/** The Markdown of a page of the guide. */
export const readDocsPage = (page: DocsNavPage): Promise<string> => readFile(docsFileOf(page), "utf8");
