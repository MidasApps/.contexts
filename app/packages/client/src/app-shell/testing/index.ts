// Test harness for module authors (`@core/client/testing`, decision 0015): a module's pages are
// tested inside the real app composition with fake ports, exactly like the core views. Import it
// from tests only; it registers a Vitest `afterEach` that fails a test on shell-reported errors.

export { expectNoAxeViolations } from "#/shared/testing/axe.ts";
export {
  apiError,
  createFakeApi,
  type FakeApi,
  type FakeRequest,
  type FakeResponse,
  type FakeRoutes,
  noContent,
  ok,
  page,
} from "#/shared/testing/fake-api.ts";
export {
  buildAccessContext,
  buildMe,
  buildOrganization,
  buildProject,
  buildUnit,
  IDS,
} from "#/shared/testing/fixtures.ts";
export { type RenderAppOptions, type RenderAppResult, renderApp, TEST_CONFIG } from "./render-app.tsx";
export { MEMBER_PERMISSIONS, SHELL_ORGANIZATIONS, SHELL_PROJECTS, shellRoutes } from "./shell-routes.ts";
