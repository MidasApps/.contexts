import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useElementHeight } from "./use-element-height.ts";

type Observed = { callback: ResizeObserverCallback; disconnected: boolean };

const observers: Observed[] = [];

const installResizeObserver = () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      readonly entry: Observed;
      constructor(callback: ResizeObserverCallback) {
        this.entry = { callback, disconnected: false };
        observers.push(this.entry);
      }
      observe() {}
      unobserve() {}
      disconnect() {
        this.entry.disconnected = true;
      }
    },
  );
};

let height = 0;

function Probe() {
  const [ref, measured] = useElementHeight<HTMLDivElement>();
  const [shown, setShown] = useState(true);
  return (
    <>
      {shown ? <div ref={ref} data-testid="measured" /> : null}
      <output>{measured}</output>
      <button type="button" onClick={() => setShown(false)}>
        hide
      </button>
    </>
  );
}

afterEach(() => {
  observers.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useElementHeight", () => {
  it("measures the element on mount, follows its resizes and stops observing when it goes away", () => {
    installResizeObserver();
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(() => height);
    height = 40;
    render(<Probe />);
    expect(screen.getByRole("status").textContent).toBe("40");

    height = 96;
    act(() => observers[0]?.callback([], {} as ResizeObserver));
    expect(screen.getByRole("status").textContent).toBe("96");

    act(() => screen.getByRole("button", { name: "hide" }).click());
    expect(observers[0]?.disconnected).toBe(true);
  });
});
