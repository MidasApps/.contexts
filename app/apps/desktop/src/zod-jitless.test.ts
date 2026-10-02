import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// `public/zod-jitless.js` (served as is, so its test lives here) turns Zod's eval probe off
// before the bundle builds its first schema: the webview's CSP has no 'unsafe-eval', and the
// probe's blocked `new Function` is reported as a CSP violation even though Zod catches it.
const APP_DIR = path.resolve(import.meta.dirname, "..");
const read = (file: string): string => readFileSync(path.join(APP_DIR, file), "utf8");

describe("zod-jitless.js", () => {
  it("runs as a classic script before the module bundle", () => {
    const html = read("index.html");
    const config = html.indexOf('<script src="/zod-jitless.js"></script>');
    expect(config).toBeGreaterThan(-1);
    expect(config).toBeLessThan(html.indexOf('<script type="module"'));
  });

  it("sets jitless on Zod's global config and keeps what is already there", () => {
    const sandbox: { __zod_globalConfig?: Record<string, unknown> } = { __zod_globalConfig: { locale: "pt-BR" } };
    runInNewContext(read("public/zod-jitless.js"), sandbox);
    expect(sandbox.__zod_globalConfig).toEqual({ locale: "pt-BR", jitless: true });
  });
});
