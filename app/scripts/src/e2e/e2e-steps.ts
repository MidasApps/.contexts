import path from "node:path";

export type E2eStep = {
  readonly label: "build" | "web" | "desktop";
  readonly cwd: string;
  /** Arguments of `process.execPath` (a JS bin, never a `.cmd` shim). */
  readonly args: readonly string[];
};

type ResolveBin = (args: { fromDir: string; packageName: string; binName: string }) => string;

/**
 * What the default `pnpm test:e2e` runs inside the emulators (follow-up 87): the builds the
 * journeys need through turbo, then Playwright in the web app and in the desktop app, each run
 * directly. `turbo run test:e2e` printed its summary and then never exited on Windows (turbo.exe
 * alive with no child, so `emulators:exec` never stopped the emulators); `turbo run build` and a
 * Playwright run started directly both exit.
 */
export const buildE2eSteps = (deps: { readonly appRoot: string; readonly resolveBin: ResolveBin }): E2eStep[] => {
  const app = (name: string): string => path.join(deps.appRoot, "apps", name);
  const playwright = (dir: string): string =>
    deps.resolveBin({ fromDir: dir, packageName: "@playwright/test", binName: "playwright" });
  const turbo = deps.resolveBin({ fromDir: deps.appRoot, packageName: "turbo", binName: "turbo" });
  return [
    // The web journeys reach the agent runtime; the desktop-web project calls the web build.
    {
      label: "build",
      cwd: deps.appRoot,
      args: [
        turbo,
        "run",
        "build",
        "--filter=@core/web",
        "--filter=@core/desktop",
        "--filter=@core/mastra",
        "--env-mode=loose",
      ],
    },
    // One app at a time: they share the e2e web port.
    { label: "web", cwd: app("web"), args: [playwright(app("web")), "test"] },
    { label: "desktop", cwd: app("desktop"), args: [playwright(app("desktop")), "test"] },
  ];
};
