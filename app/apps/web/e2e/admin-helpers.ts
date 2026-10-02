import type { Locator, Page } from "@playwright/test";
import { expect } from "./sp5-test.ts";

// Helpers of the `/admin` journeys (admin-*.spec.ts).

export const ERROR_ENVELOPE = { error: { code: "INTERNAL_ERROR", message: "Internal error.", requestId: "e2e-request-1" } };

/**
 * Answers matching `/v1` reads with a 500 envelope until the returned `heal` is called (the
 * client retries a failed query on its own before it shows the error state).
 */
export const failUntilHealed = async (page: Page, pattern: string): Promise<() => void> => {
  let failing = true;
  await page.route(pattern, async (route) => {
    if (!failing || route.request().method() !== "GET") return route.continue();
    await route.fulfill({ status: 500, json: ERROR_ENVELOPE });
  });
  return () => {
    failing = false;
  };
};

/**
 * Picks an organization in an `/admin` organization picker (a searchable combobox): types the
 * name in its search box, as a person does once the platform has more than a screenful.
 */
export const chooseOrganization = async (page: Page, trigger: Locator, name: string): Promise<void> => {
  await trigger.click();
  await page.getByPlaceholder("Buscar organização").fill(name);
  await page.getByRole("option", { name, exact: true }).click();
  await expect(trigger).toHaveText(name);
};
