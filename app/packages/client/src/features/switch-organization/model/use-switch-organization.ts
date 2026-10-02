"use client";

import { setActiveOrganizationEndpoint } from "@core/contracts";
import { useIsMutating, useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useAuth } from "#/shared/lib/auth/auth-context.tsx";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { useShellUi } from "#/shared/lib/shell/shell-ui-context.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";

const SWITCH_ORGANIZATION_KEY = ["switch-organization"] as const;

/** True while an organization switch runs: the switcher shows it and refuses another pick. */
export const useIsSwitchingOrganization = (): boolean => useIsMutating({ mutationKey: SWITCH_ORGANIZATION_KEY }) > 0;

/**
 * Switches the active organization (decision 0012 §6, SP2 spec §4): navigate to `/o/:id` (the
 * project and unit are left behind), `PUT /v1/me/active-organization` (the server syncs claims and
 * `lastContext`), force an ID token refresh so the Bearer carries the new claims, then refetch
 * every query and reset the shell UI store (rules/state-management.md §15). A failure keeps the
 * user on the new organization's page (it authorizes on its own) and says what happened.
 */
export const useSwitchOrganization = (): UseMutationResult<void, unknown, string> => {
  const t = useTranslations("shell.switcher");
  const callEndpoint = useCallEndpoint();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const resetShellUi = useShellUi((state) => state.reset);
  const describe = useDescribeError();
  return useMutation({
    mutationKey: SWITCH_ORGANIZATION_KEY,
    mutationFn: async (organizationId: string) => {
      router.navigate({ id: "organization", organizationId });
      await callEndpoint(setActiveOrganizationEndpoint, { body: { organizationId } });
      await auth.getIdToken({ forceRefresh: true });
      resetShellUi();
      await queryClient.invalidateQueries();
    },
    onError: (error) => {
      notify.error(t("switchFailed"), { description: describe(error).message });
    },
  });
};
