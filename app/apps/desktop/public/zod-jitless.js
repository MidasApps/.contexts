// Runs before the bundle (index.html): Zod builds its schemas jitless, so it never probes
// `new Function`, which the webview CSP blocks and reports as a violation (no 'unsafe-eval').
globalThis.__zod_globalConfig = Object.assign(globalThis.__zod_globalConfig || {}, { jitless: true });
