"use client";

import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import type { IconName } from "#/shared/ui/atoms/Icon/icon-registry.ts";
import { isSessionLost, SignInAgainButton } from "#/shared/ui/molecules/ErrorState/SignInAgainButton.tsx";

type PageStateLayoutProps = {
  icon: IconName;
  tone: "neutral" | "amber" | "destructive";
  title: string;
  description: string;
  reference?: string | undefined;
  actions: ReactNode;
  role?: "alert" | undefined;
};

const TONES = { neutral: "bg-muted text-muted-foreground", amber: "bg-amber/14 text-amber", destructive: "bg-destructive/14 text-destructive" } as const;

function PageStateLayout({ icon, tone, title, description, reference, actions, role }: PageStateLayoutProps) {
  return (
    <div role={role} data-slot="page-state" className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <span className={cn("mb-4 grid size-12 place-items-center rounded-lg", TONES[tone])}>
        <Icon name={icon} className="size-5" />
      </span>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      {reference === undefined ? null : <p className="mt-2 font-mono text-[11.5px] text-muted-foreground">{reference}</p>}
      <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>
    </div>
  );
}

function HomeAction({ variant = "default" }: { variant?: "default" | "secondary" }) {
  const t = useTranslations("shell.pageState");
  return (
    <Button variant={variant} asChild>
      <RouteLink to={{ id: "home" }}>{t("goHome")}</RouteLink>
    </Button>
  );
}

/** The organization list: a way on that never redirects (home follows the last context). */
function OrganizationsAction() {
  const t = useTranslations("shell.pageState");
  return (
    <Button variant="secondary" asChild>
      <RouteLink to={{ id: "organizations" }}>{t("goToOrganizations")}</RouteLink>
    </Button>
  );
}

/**
 * A page the user cannot see or that does not exist (SP1 answers 404 for both, SP2 spec §4).
 * Besides home, it offers the organization list: home redirects to the last context, which may
 * be this very page (a project deleted after the member last used it), so it must not be the only
 * way out (UX review U-06).
 */
export function PageNotFound() {
  const t = useTranslations("shell.pageState");
  return (
    <PageStateLayout
      icon="search"
      tone="neutral"
      title={t("notFoundTitle")}
      description={t("notFoundDescription")}
      actions={
        <>
          <HomeAction />
          <OrganizationsAction />
        </>
      }
    />
  );
}

/** Signed in but without the permission for this page (API 403, SP2 spec §4). */
export function PageForbidden() {
  const t = useTranslations("shell.pageState");
  return <PageStateLayout icon="lock" tone="amber" title={t("forbiddenTitle")} description={t("forbiddenDescription")} actions={<HomeAction />} />;
}

/**
 * A page whose render failed on the server (UX review U-07; the web's `error.tsx`): translated
 * copy, the server's error identifier (Next `digest`) as the reference, a retry and a way home.
 */
export function PageRenderError({ reference, onRetry }: { reference: string | undefined; onRetry: () => void }) {
  const t = useTranslations();
  return (
    <PageStateLayout
      role="alert"
      icon="alert-triangle"
      tone="destructive"
      title={t("shell.serverError.title")}
      description={t("shell.serverError.description")}
      reference={reference === undefined ? undefined : t("common.errorState.reference", { requestId: reference })}
      actions={
        <>
          <Button variant="secondary" onClick={onRetry}>
            {t("common.actions.retry")}
          </Button>
          <HomeAction variant="secondary" />
        </>
      }
    />
  );
}

/**
 * A page whose main data failed to load (not 403/404): the copy of the error code, its request
 * reference and a retry, plus a way home. A lost session (401) offers signing in again instead.
 */
export function PageError({ error, onRetry, retrying = false }: { error: unknown; onRetry: () => void; retrying?: boolean }) {
  const t = useTranslations();
  const described = useDescribeError()(error);
  return (
    <PageStateLayout
      role="alert"
      icon="alert-triangle"
      tone="destructive"
      title={t("common.errorState.title")}
      description={described.message}
      reference={described.requestId === undefined ? undefined : t("common.errorState.reference", { requestId: described.requestId })}
      actions={
        isSessionLost(error) ? (
          <SignInAgainButton />
        ) : (
          <>
            <Button variant="secondary" onClick={onRetry} pending={retrying}>
              {t("common.actions.retry")}
            </Button>
            <HomeAction variant="secondary" />
          </>
        )
      }
    />
  );
}
