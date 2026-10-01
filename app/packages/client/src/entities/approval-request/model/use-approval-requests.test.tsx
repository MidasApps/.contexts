import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "#/shared/testing/render.tsx";
import type { ApprovalRequestsApi } from "../api/approval-requests-api.ts";
import { buildApprovalRequest } from "../approval-request.fixture.ts";
import { type ApprovalChangeSource, useApprovalRequests } from "./use-approval-requests.ts";

const api = (): Pick<ApprovalRequestsApi, "list"> & { calls: number } => {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    list: () => {
      state.calls += 1;
      return Promise.resolve({
        ok: true,
        data: { items: [buildApprovalRequest(), buildApprovalRequest({ id: "Ap2qW2eR3tY4uI5oP6aS", requestedBy: { type: "user", id: "viewer-uid" } })], cursor: null, hasMore: false },
      });
    },
  };
};

const Probe = (props: { readonly source: Pick<ApprovalRequestsApi, "list">; readonly live?: ApprovalChangeSource }) => {
  const result = useApprovalRequests({ api: props.source, organizationId: "OrgAaaaaaaaaaaaaaaaaa", ...(props.live === undefined ? {} : { live: props.live }) }, "viewer-uid");
  return (
    <p>
      {result.mode}:{result.requests.length}:{result.pendingCount}
    </p>
  );
};

describe("useApprovalRequests", () => {
  it("polls without a live source and counts only others' pending requests for the badge", async () => {
    renderWithProviders(<Probe source={api()} />);
    expect(await screen.findByText("polling:2:1")).toBeTruthy();
  });

  it("stays on the listener while it is allowed and refetches on each change", async () => {
    const source = api();
    let notify = (): void => undefined;
    const live: ApprovalChangeSource = ({ onChange }) => {
      notify = onChange;
      return () => undefined;
    };
    renderWithProviders(<Probe source={source} live={live} />);
    expect(await screen.findByText("listener:2:1")).toBeTruthy();
    const before = source.calls;
    notify();
    await waitFor(() => expect(source.calls).toBe(before + 1));
  });

  it("falls back to polling when the listener is denied", async () => {
    const live: ApprovalChangeSource = ({ onDenied }) => {
      queueMicrotask(onDenied);
      return () => undefined;
    };
    renderWithProviders(<Probe source={api()} live={live} />);
    expect(await screen.findByText("polling:2:1")).toBeTruthy();
  });
});
