import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithClient } from "#/shared/testing/render-client.tsx";
import { type DocsNavGroup, DocsView } from "./DocsView.tsx";

const GROUPS: DocsNavGroup[] = [
  {
    title: "Comece aqui",
    pages: [
      { slug: "", title: "Visão geral" },
      { slug: "getting-started", title: "Primeiros passos" },
    ],
  },
  { title: "Organização", pages: [{ slug: "members", title: "Membros e convites" }] },
];

const MARKDOWN = [
  "# Primeiros passos",
  "",
  "Veja [Membros e convites](/docs/members) e a [referência](https://example.com/guia).",
  "",
  "Um link [qualquer](javascript:alert(1)).",
  "",
  "![Tela de membros](/guide/members-list.jpg)",
  "",
  "![Imagem de fora](https://example.com/x.png)",
  "",
  "```bash",
  "curl https://example.com",
  "```",
  "",
  "| Papel | Permissão |",
  "|---|---|",
  "| Leitor | `core.organization.read` |",
].join("\n");

const render = (locale: "pt-BR" | "en-US" = "pt-BR") =>
  renderWithClient(<DocsView groups={GROUPS} page="getting-started" markdown={MARKDOWN} contentLocale="pt-BR" />, {
    path: "/docs/getting-started",
    locale,
  });

describe("DocsView", () => {
  it("renders the page with the current one marked in the sidebar", async () => {
    const { container } = render();
    expect(screen.getByRole("heading", { level: 1, name: "Primeiros passos" })).toBeDefined();
    const current = container.querySelector("[aria-current='page']");
    expect(current?.textContent).toBe("Primeiros passos");
    expect(screen.queryByText("Esta documentação está disponível apenas em português.")).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("keeps guide links in the app, opens external ones in a new tab and drops the rest", () => {
    render();
    const article = screen.getByRole("article");
    const guide = article.querySelector("a[href='/docs/members']");
    expect(guide?.getAttribute("target")).toBeNull();
    const external = article.querySelector("a[href='https://example.com/guia']");
    expect(external?.getAttribute("target")).toBe("_blank");
    expect(external?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(article.querySelector("a[href^='javascript']")).toBeNull();
    expect(screen.getByText("qualquer").closest("a")).toBeNull();
    expect(screen.getByRole("region", { name: "Código bash" })).toBeDefined();
  });

  it("puts tables in a box keyboard users can focus to scroll sideways", () => {
    render();
    const box = screen.getByRole("group", { name: "Tabela (role para o lado para ver tudo)" });
    expect(box.getAttribute("tabindex")).toBe("0");
    expect(box.querySelector("table")?.textContent).toContain("Leitor");
  });

  it("shows the guide's own screenshots and no image from elsewhere", () => {
    render();
    const images = [...screen.getByRole("article").querySelectorAll("img")];
    expect(images.map((image) => [image.getAttribute("src"), image.getAttribute("alt")])).toEqual([
      ["/guide/members-list.jpg", "Tela de membros"],
    ]);
  });

  it("links the previous and the next page", () => {
    render();
    const steps = screen.getByRole("navigation", { name: "Página anterior e próxima" });
    expect(steps.querySelector("a[href='/docs']")?.textContent).toContain("Visão geral");
    expect(steps.querySelector("a[href='/docs/members']")?.textContent).toContain("Membros e convites");
  });

  it("says the page is in Portuguese when the UI is in another language", () => {
    render("en-US");
    expect(screen.getByText("This documentation is only available in Portuguese.")).toBeDefined();
    expect(screen.getByRole("article").getAttribute("lang")).toBe("pt-BR");
  });
});
