import { OrganizationHomeView } from "@core/client/views/organization-home";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/o/$organizationId/")({ component: OrganizationHomeView });
