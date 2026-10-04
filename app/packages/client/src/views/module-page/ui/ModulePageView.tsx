"use client";

import { Component, type ReactNode, Suspense } from "react";
import { useTranslations } from "use-intl";
import { usePermissions } from "#/entities/permission/index.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { useModuleRegistry, useNavigationRegistry } from "#/shared/lib/shell/shell-registry-context.tsx";
import { LoadingState } from "#/shared/ui/molecules/LoadingState/LoadingState.tsx";
import { PageError, PageForbidden, PageNotFound } from "#/widgets/page-state/index.ts";

type BoundaryState = { error: unknown };

/**
 * A module page that fails to load its chunk or to render stays inside the shell (the rest of the
 * app keeps working) and offers a retry. Class component: React exposes error boundaries only so.
 */
class ModulePageBoundary extends Component<
  { children: ReactNode; onError?: ((error: unknown) => void) | undefined },
  BoundaryState
> {
  override state: BoundaryState = { error: undefined };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error: error ?? new Error("module page failed") };
  }

  override componentDidCatch(error: unknown): void {
    this.props.onError?.(error);
  }

  override render(): ReactNode {
    if (this.state.error === undefined) return this.props.children;
    return <PageError error={this.state.error} onRetry={() => this.setState({ error: undefined })} />;
  }
}

/** The permission of the navigation item that opens this page (the module's own gate for it). */
const usePagePermission = (moduleId: string, pageKey: string | undefined): string | undefined => {
  const items = useNavigationRegistry().visibleItems("project", () => true);
  const item = items.find(
    (candidate) =>
      candidate.target.kind === "module" && candidate.target.moduleId === moduleId && candidate.target.path === pageKey,
  );
  return item?.permission;
};

/**
 * `/o/:organizationId/p/:projectId/m/:moduleId/*` (decision 0012 §4): resolves the page from the
 * client module registry (lazy, code-split per page) and renders it with its `:params`. Unknown
 * modules or paths render not-found; a page whose navigation item needs a permission the viewer
 * lacks at this node renders forbidden (the module's API calls authorize again).
 */
export function ModulePageView({ onError }: { onError?: (error: unknown) => void }) {
  const t = useTranslations("shell.modulePage");
  const params = useRouter().useRouteParams();
  const moduleId = params["moduleId"] ?? "";
  const resolved = useModuleRegistry().resolvePage(moduleId, params["rest"] ?? "");
  const permission = usePagePermission(moduleId, resolved?.key);
  const permissions = usePermissions();
  if (resolved === null) return <PageNotFound />;
  if (permission !== undefined && permissions.status === "pending")
    return <LoadingState label={t("loading")} rows={5} />;
  if (permission !== undefined && !permissions.can(permission)) return <PageForbidden />;
  const { Page } = resolved;
  return (
    <ModulePageBoundary key={`${moduleId}/${resolved.key}`} onError={onError}>
      <Suspense fallback={<LoadingState label={t("loading")} rows={5} />}>
        <Page moduleId={moduleId} params={resolved.params} />
      </Suspense>
    </ModulePageBoundary>
  );
}
