import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import { RecordingClock } from "./recording-clock.tsx";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const clock = (container: HTMLElement): string | null | undefined =>
  container.querySelector("[data-slot=recording-clock]")?.textContent;

describe("RecordingClock", () => {
  it("counts the recording against its 60 s cap and announces the end once, 10 s before", () => {
    const { container } = renderWithProviders(<RecordingClock />);
    expect(clock(container)).toBe("0:00 / 1:00");
    expect(screen.getByRole("status").textContent).toBe("");
    act(() => {
      vi.advanceTimersByTime(42_000);
    });
    expect(clock(container)).toBe("0:42 / 1:00");
    expect(screen.getByRole("status").textContent).toBe("");
    act(() => {
      vi.advanceTimersByTime(8_000);
    });
    expect(screen.getByRole("status").textContent).toBe("A gravação para sozinha em 10 segundos.");
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(clock(container)).toBe("1:00 / 1:00");
  });
});
