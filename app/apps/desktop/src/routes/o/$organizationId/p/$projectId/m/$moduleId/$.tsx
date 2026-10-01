import { ModulePageView } from "@core/client/views/module-page";
import { createFileRoute } from "@tanstack/react-router";

// Catch-all module route (decision 0012 §4): the page comes from the client module registry, so
// modules never add route files; an empty tail is the module's root page.
export const Route = createFileRoute("/o/$organizationId/p/$projectId/m/$moduleId/$")({ component: ModulePageView });
