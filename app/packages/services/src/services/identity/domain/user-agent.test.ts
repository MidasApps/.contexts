import { describe, expect, it } from "vitest";
import { summarizeUserAgent } from "./user-agent.ts";

const CHROME_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const EDGE_WINDOWS = `${CHROME_WINDOWS} Edg/140.0.0.0`;
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0";
const SAFARI_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const SAFARI_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

describe("summarizeUserAgent", () => {
  it.each([
    [CHROME_WINDOWS, "Chrome on Windows"],
    [EDGE_WINDOWS, "Edge on Windows"],
    [FIREFOX_LINUX, "Firefox on Linux"],
    [SAFARI_IOS, "Safari on iOS"],
    [SAFARI_MAC, "Safari on macOS"],
    [CHROME_ANDROID, "Chrome on Android"],
  ])("keeps only the browser and OS family of %s", (userAgent, summary) => {
    expect(summarizeUserAgent(userAgent)).toBe(summary);
  });

  it("names unknown or missing agents without echoing them", () => {
    expect(summarizeUserAgent(null)).toBe("Unknown browser on unknown OS");
    expect(summarizeUserAgent("curl/8.9.1 secret-looking-value")).toBe("Unknown browser on unknown OS");
    expect(summarizeUserAgent("core-desktop/1.0 (Windows)")).toBe("Unknown browser on Windows");
  });
});
