import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { SafeMarkdown } from "./safe-markdown.tsx";

const HOSTILE = [
  "Before",
  "",
  "<script>window.pwned = true</script>",
  "",
  '<img src="x" onerror="window.pwned = true">',
  "",
  '<iframe src="https://evil.test"></iframe>',
  "",
  '<a href="javascript:alert(1)" onclick="alert(2)">raw anchor</a>',
  "",
  '<b style="position:fixed">styled</b> after',
].join("\n");

describe("SafeMarkdown", () => {
  it("renders markdown structure", () => {
    renderWithProviders(<SafeMarkdown>{"# Title\n\nSome **bold** text.\n\n- one\n- two"}</SafeMarkdown>);
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Title")).toBeTruthy();
  });

  it("never renders raw HTML written by the model", () => {
    const { container } = renderWithProviders(<SafeMarkdown>{HOSTILE}</SafeMarkdown>);
    expect(container.querySelector("script, iframe, img, a, b, [onerror], [onclick], [style*='fixed']")).toBeNull();
    expect((globalThis as { pwned?: boolean }).pwned).toBeUndefined();
    expect(screen.getByText(/Before/)).toBeTruthy();
  });

  it("keeps http(s) links, shows the host and opens them in a new tab without an opener", () => {
    renderWithProviders(<SafeMarkdown>{"Read [the guide](https://docs.example.com/guide)."}</SafeMarkdown>);
    const link = screen.getByRole("link", { name: /the guide/ });
    expect(link.getAttribute("href")).toBe("https://docs.example.com/guide");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(link.textContent).toContain("docs.example.com");
  });

  it("renders the text of javascript: and data: links without a link", () => {
    renderWithProviders(
      <SafeMarkdown>{"[click me](javascript:alert(1)) and [this](data:text/html,x) and [rel](/admin)"}</SafeMarkdown>,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/click me/)).toBeTruthy();
  });

  it("does not load images the model points to; the alt text stays", () => {
    const { container } = renderWithProviders(
      <SafeMarkdown>{"![tracking pixel](https://evil.test/p.png)"}</SafeMarkdown>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/tracking pixel/)).toBeTruthy();
  });

  it("renders citations through the caller and code as code", () => {
    renderWithProviders(
      <SafeMarkdown renderCitation={(index) => <sup data-testid="cite">{index}</sup>}>
        {"Fact [1](#cite-1).\n\n```ts\nconst a = 1;\n```"}
      </SafeMarkdown>,
    );
    expect(screen.getByTestId("cite").textContent).toBe("1");
    expect(screen.getByText(/const a = 1;/)).toBeTruthy();
  });

  it("gives fenced code a labelled region with its language and a copy button, and keeps inline code inline", async () => {
    const { user, container } = renderWithProviders(
      <SafeMarkdown>{"Use `npm ci` first.\n\n```ts\nconst a = 1;\n```"}</SafeMarkdown>,
    );
    const region = screen.getByRole("region", { name: "Código ts" });
    expect(region.textContent).toBe("const a = 1;");
    expect(screen.getByText("npm ci").closest("[data-slot=code-block]")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Copiar" }));
    // user-event stands in for the clipboard.
    await vi.waitFor(async () => expect(await navigator.clipboard.readText()).toBe("const a = 1;"));
    await expectNoAxeViolations(container);
  });

  it("has no axe violations", async () => {
    const { container } = renderWithProviders(
      <SafeMarkdown>
        {"## Heading\n\nA [link](https://example.com) and `code`.\n\n| a | b |\n|---|---|\n| 1 | 2 |"}
      </SafeMarkdown>,
    );
    await expectNoAxeViolations(container);
  });
});
