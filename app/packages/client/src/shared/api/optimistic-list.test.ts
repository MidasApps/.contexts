import { describe, expect, it } from "vitest";
import { createTestQueryClient } from "#/shared/testing/render.tsx";
import { patchCachedLists } from "./optimistic-list.ts";

const pages = (items: string[]) => ({ pageParams: [undefined], pages: [{ data: items, meta: { page: { cursor: null, hasMore: false, limit: 50 } } }] });

describe("patchCachedLists", () => {
  it("changes every cached list under the key and rolls back to the snapshot", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(["me", "sessions", { limit: 20 }], pages(["a", "b"]));
    queryClient.setQueryData(["me", "sessions", { limit: 50 }], pages(["a"]));
    queryClient.setQueryData(["me", "other"], pages(["a"]));
    const rollback = await patchCachedLists<string>(queryClient, ["me", "sessions"], (items) => items.filter((item) => item !== "a"));
    expect(queryClient.getQueryData<ReturnType<typeof pages>>(["me", "sessions", { limit: 20 }])?.pages[0]?.data).toEqual(["b"]);
    expect(queryClient.getQueryData<ReturnType<typeof pages>>(["me", "sessions", { limit: 50 }])?.pages[0]?.data).toEqual([]);
    expect(queryClient.getQueryData<ReturnType<typeof pages>>(["me", "other"])?.pages[0]?.data).toEqual(["a"]);
    rollback();
    expect(queryClient.getQueryData<ReturnType<typeof pages>>(["me", "sessions", { limit: 20 }])?.pages[0]?.data).toEqual(["a", "b"]);
  });
});
