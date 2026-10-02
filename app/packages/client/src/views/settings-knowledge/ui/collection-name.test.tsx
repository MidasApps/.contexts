import { loadMessages } from "@core/i18n";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { IntlProvider } from "use-intl";
import { describe, expect, it } from "vitest";
import { namespaceOfTarget } from "#/entities/knowledge/index.ts";
import { useCollectionName } from "./KnowledgeDocumentsTable.tsx";

const wrapper = ({ children }: { children: ReactNode }) => (
  <IntlProvider locale="pt-BR" messages={loadMessages("pt-BR")} timeZone="UTC">
    {children}
  </IntlProvider>
);

describe("useCollectionName", () => {
  it("names a known project, and never shows a project id", () => {
    const names = new Map([["p-1", "Launch"]]);
    const complete = renderHook(() => useCollectionName(names, true), { wrapper }).result.current;
    expect(complete(namespaceOfTarget("p-1"))).toBe("Projeto Launch");
    expect(complete(namespaceOfTarget("p-gone"))).toBe("Projeto removido");
    const partial = renderHook(() => useCollectionName(names, false), { wrapper }).result.current;
    expect(partial(namespaceOfTarget("p-later"))).toBe("Outro projeto da organização");
  });
});
