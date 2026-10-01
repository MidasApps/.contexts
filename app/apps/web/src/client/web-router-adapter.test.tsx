// @vitest-environment jsdom
import "@core/client/testing/setup";
import type { RouterLinkProps } from "@core/client/shared/lib/router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createWebRouterAdapter, stripLocalePrefix, type WebNavigator, type WebRouterHooks } from "./web-router-adapter";

const fakeHooks = (pathname: string, search = ""): WebRouterHooks => ({
  usePathname: () => pathname,
  useSearch: () => search,
  Link: ({ href, replace, children, ...props }: { href: string; replace?: boolean | undefined } & Omit<RouterLinkProps, "to" | "replace">) => (
    <a data-href={href} data-replace={String(replace === true)} {...props}>
      {children}
    </a>
  ),
});

const fakeNavigator = (): WebNavigator & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    push: (href) => void calls.push(`push ${href}`),
    replace: (href) => void calls.push(`replace ${href}`),
    replaceInLocale: (href, locale) => void calls.push(`locale ${locale} ${href}`),
  };
};

describe("createWebRouterAdapter", () => {
  it("prefixes every href with the locale", () => {
    const router = createWebRouterAdapter({ locale: "en-US", assign: vi.fn(), hooks: fakeHooks("/") });

    expect(router.href({ id: "home" })).toBe("/en-US");
    expect(router.href({ id: "sign-in", next: "/o/a" })).toBe("/en-US/sign-in?next=%2Fo%2Fa");
    expect(router.href({ id: "project", organizationId: "org 1", projectId: "p", unit: "u" })).toBe("/en-US/o/org%201/p/p?unit=u");
    expect(router.href({ id: "admin", rest: "users" })).toBe("/en-US/admin/users");
  });

  it("navigates through next-intl's router with unprefixed hrefs once attached", () => {
    const assign = vi.fn();
    const router = createWebRouterAdapter({ locale: "pt-BR", assign, hooks: fakeHooks("/") });
    const navigator = fakeNavigator();
    router.attach(navigator);

    router.navigate({ id: "organization", organizationId: "a" });
    router.navigate({ id: "profile", section: "account" }, { replace: true });

    expect(navigator.calls).toEqual(["push /o/a", "replace /profile/account"]);
    expect(assign).not.toHaveBeenCalled();
  });

  it("changes the address in place for a same-page navigation, without asking the router for a new page", () => {
    const replaceAddress = vi.fn();
    const router = createWebRouterAdapter({ locale: "pt-BR", assign: vi.fn(), hooks: fakeHooks("/o/a/p/b/chat"), replaceAddress });
    const navigator = fakeNavigator();
    router.attach(navigator);

    router.navigate({ id: "chat", organizationId: "a", projectId: "b", conversationId: "c1" }, { replace: true, samePage: true });

    expect(replaceAddress).toHaveBeenCalledWith("/pt-BR/o/a/p/b/chat/c1");
    expect(navigator.calls).toEqual([]);
  });

  it("falls back to a full navigation with the locale before the bridge attaches", () => {
    const assign = vi.fn();
    const router = createWebRouterAdapter({ locale: "es-419", assign, hooks: fakeHooks("/") });

    router.navigate({ id: "organizations" });

    expect(assign).toHaveBeenCalledWith("/es-419/organizations");
  });

  it("reads params and the location from the unprefixed pathname and search", () => {
    const router = createWebRouterAdapter({ locale: "pt-BR", assign: vi.fn(), hooks: fakeHooks("/o/org-1/p/proj-2/m/example/items/9", "unit=u-3") });
    let seen: unknown;
    function Probe() {
      seen = { params: router.useRouteParams(), unit: router.useSearchParam("unit"), path: router.useLocationPath() };
      return null;
    }
    render(<Probe />);

    expect(seen).toEqual({
      params: { organizationId: "org-1", projectId: "proj-2", moduleId: "example", rest: "items/9", unit: "u-3" },
      unit: "u-3",
      path: "/o/org-1/p/proj-2/m/example/items/9",
    });
  });

  it("renders links to the unprefixed route href (next-intl adds the locale)", () => {
    const router = createWebRouterAdapter({ locale: "pt-BR", assign: vi.fn(), hooks: fakeHooks("/") });

    render(
      <router.Link to={{ id: "settings", organizationId: "a", section: "members" }} replace>
        Members
      </router.Link>,
    );

    expect(screen.getByText("Members")).toHaveProperty("dataset.href", "/o/a/settings/members");
    expect(screen.getByText("Members")).toHaveProperty("dataset.replace", "true");
  });

  it("switches locale on the current path and search", () => {
    window.history.replaceState(null, "", "/pt-BR/o/a/p/b?unit=c");
    const router = createWebRouterAdapter({ locale: "pt-BR", assign: vi.fn(), hooks: fakeHooks("/o/a/p/b", "unit=c") });
    const navigator = fakeNavigator();
    router.attach(navigator);

    router.switchLocale("en-US");

    expect(navigator.calls).toEqual(["locale en-US /o/a/p/b?unit=c"]);
  });
});

describe("stripLocalePrefix", () => {
  it("removes the locale segment and keeps the root", () => {
    expect(stripLocalePrefix("/pt-BR/o/a/p/b")).toBe("/o/a/p/b");
    expect(stripLocalePrefix("/en-US")).toBe("/");
  });
});
