// Test helpers for network states: going offline, and a request the test answers when it wants
// (to see the pending state of a write).
import { act } from "@testing-library/react";
import type { FakeResponse } from "./fake-api.ts";

/** Sets `navigator.onLine` and fires the event the app listens to. Reset with `setOnline(true)`. */
export const setOnline = (online: boolean): void => {
  Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, get: () => online });
  act(() => void globalThis.dispatchEvent(new Event(online ? "online" : "offline")));
};

export type HeldResponse = {
  /** Route handler for the fake API: the request waits until `release`. */
  readonly handler: () => Promise<FakeResponse>;
  readonly release: (response: FakeResponse) => void;
};

/** A fake API answer held back until the test releases it. */
export const holdResponse = (): HeldResponse => {
  let release: (response: FakeResponse) => void = () => undefined;
  const answer = new Promise<FakeResponse>((resolve) => {
    release = resolve;
  });
  return { handler: () => answer, release: (response) => release(response) };
};
