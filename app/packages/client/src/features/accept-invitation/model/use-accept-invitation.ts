"use client";

import { acceptInvitationEndpoint, previewInvitationEndpoint, type AcceptInvitationResponse, type InvitationPreview } from "@core/contracts";
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useAuth } from "#/shared/lib/auth/auth-context.tsx";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

/**
 * `POST /v1/invitations/preview`: who invites to which organization. The token is a one-time
 * secret, so it is not part of the query key (one invitation per page) and the entry is dropped as
 * soon as the page unmounts (`gcTime: 0`); it lives under `["me"]`, which sign-out clears.
 */
export const useInvitationPreview = (token: string | null): UseQueryResult<InvitationPreview> => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: ["me", "invitation-preview"],
    queryFn: async ({ signal }) => (await callEndpoint(previewInvitationEndpoint, { body: { token: token ?? "" }, signal })).data,
    enabled: signedIn && token !== null,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  });
};

/**
 * `POST /v1/invitations/accept`, then a forced token refresh (the new grant is in the claims) and a
 * refetch of the user and tenant data, so the new organization appears everywhere at once.
 */
export const useAcceptInvitation = (): UseMutationResult<AcceptInvitationResponse, unknown, string> => {
  const callEndpoint = useCallEndpoint();
  const auth = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => (await callEndpoint(acceptInvitationEndpoint, { body: { token } })).data,
    onSuccess: async () => {
      await auth.getIdToken({ forceRefresh: true });
      // Not the whole `["me"]` prefix: the preview would refetch a used token and flash an error.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["me"], exact: true }),
        queryClient.invalidateQueries({ queryKey: ["me", "organizations"] }),
        queryClient.invalidateQueries({ queryKey: ["organizations"] }),
      ]);
    },
  });
};
