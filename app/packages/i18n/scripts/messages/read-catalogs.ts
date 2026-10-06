import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { CatalogEntry } from "./check-catalogs.ts";

const readJson = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, "utf8")) as unknown;

const listDirectories = async (dir: string): Promise<string[]> => {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error: unknown) {
    // A missing folder (no modules installed yet) is an empty list, anything else is a real failure.
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
};

const listJsonFiles = async (dir: string): Promise<string[]> => {
  try {
    return (await readdir(dir)).filter((name) => name.endsWith(".json"));
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
};

/** Core layout: `<messagesDir>/<locale>/<namespace>.json`. */
export const readCoreCatalogs = async (messagesDir: string): Promise<CatalogEntry[]> => {
  const locales = await listDirectories(messagesDir);
  const perLocale = await Promise.all(
    locales.map(async (locale) => {
      const files = await listJsonFiles(path.join(messagesDir, locale));
      return Promise.all(
        files.map(async (name) => {
          const file = path.join(messagesDir, locale, name);
          return { namespace: path.basename(name, ".json"), locale, messages: await readJson(file), file };
        }),
      );
    }),
  );
  return perLocale.flat();
};

/** Module layout: `<modulesDir>/<id>/src/messages/<locale>.json`, namespace = module id. */
export const readModuleCatalogs = async (modulesDir: string): Promise<CatalogEntry[]> => {
  const moduleIds = await listDirectories(modulesDir);
  const perModule = await Promise.all(
    moduleIds.map(async (moduleId) => {
      const dir = path.join(modulesDir, moduleId, "src", "messages");
      const files = await listJsonFiles(dir);
      return Promise.all(
        files.map(async (name) => {
          const file = path.join(dir, name);
          return { namespace: moduleId, locale: path.basename(name, ".json"), messages: await readJson(file), file };
        }),
      );
    }),
  );
  return perModule.flat();
};
