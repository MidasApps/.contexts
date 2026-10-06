import { OrganizationsView } from "@core/client/views/organizations";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/organizations")({ component: OrganizationsView });
