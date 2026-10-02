import { loadMessages } from "@core/i18n";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { IntlProvider } from "use-intl";
import { describe, expect, it } from "vitest";
import { cronDescriptionOf, useDescribeCron } from "./describe-cron.ts";

describe("cronDescriptionOf", () => {
  it("describes each preset shape with its localized time", () => {
    expect(cronDescriptionOf("15 * * * *", "pt-BR")).toEqual({ kind: "hourly", values: { minute: 15 } });
    expect(cronDescriptionOf("30 8 * * 1-5", "pt-BR")).toEqual({ kind: "weekdays", values: { time: "08:30" } });
    expect(cronDescriptionOf("0 9 * * *", "en-US")).toEqual({ kind: "daily", values: { time: "9:00 AM" } });
    expect(cronDescriptionOf("0 3 1 * *", "pt-BR")).toEqual({ kind: "monthly", values: { day: 1, time: "03:00" } });
  });

  it("names the weekday in the viewer's language", () => {
    expect(cronDescriptionOf("0 9 * * 1", "pt-BR")).toEqual({ kind: "weekly", values: { weekday: "segunda-feira", time: "09:00" } });
    expect(cronDescriptionOf("0 9 * * 0", "es-419")).toEqual({ kind: "weekly", values: { weekday: "domingo", time: expect.any(String) } });
  });

  it("has no description for expressions outside the presets", () => {
    expect(cronDescriptionOf("*/5 * * * *", "pt-BR")).toBeNull();
    expect(cronDescriptionOf("0 9 * 1 *", "pt-BR")).toBeNull();
  });
});

describe("useDescribeCron", () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <IntlProvider locale="pt-BR" messages={loadMessages("pt-BR")} timeZone="UTC">
      {children}
    </IntlProvider>
  );

  it("writes the description in words, or null for a custom expression", () => {
    const { result } = renderHook(() => useDescribeCron(), { wrapper });
    expect(result.current("0 9 * * 1-5")).toBe("Dias úteis às 09:00");
    expect(result.current("0 9 * * 3")).toBe("Toda semana, quarta-feira, às 09:00");
    expect(result.current("*/10 * * * *")).toBeNull();
  });
});
