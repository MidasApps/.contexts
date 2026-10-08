// Installed modules that own Postgres migrations (decision 0077). A composition file like
// `catalog.modules.ts`: add a module here when it is installed. `pnpm db:migrate` loads this file
// by path, applies the core's migrations and then each listed module's, in this order; no core
// package imports a module. `folder` is relative to this file.
export const MODULE_MIGRATIONS: readonly { moduleId: string; folder: string }[] = [
  { moduleId: "example", folder: "modules/example/migrations" },
];
