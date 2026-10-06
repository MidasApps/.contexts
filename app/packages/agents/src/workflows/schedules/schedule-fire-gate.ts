import type { Logger } from "@core/services";
import type { MastraCompositeStore } from "@mastra/core/storage";

type SchedulesStore = NonNullable<Awaited<ReturnType<MastraCompositeStore["getStore"]>>> & {
  readonly listDueSchedules: (now: number, limit?: number) => Promise<unknown[]>;
};

/**
 * The `workflows.schedules` flag over Mastra's scheduler (decision 0037 amendment A2): while the
 * flag is off, the schedules domain lists no due schedule, so no tenant or platform schedule fires
 * on any instance. Rows, their `paused` state and `nextFireAt` stay untouched, and the management
 * API (`mastra.schedules`) keeps working; once the flag is on again a missed schedule fires once on
 * the next tick (Mastra computes the next fire from now, there is no backfill).
 *
 * Mastra's `SchedulerWorker` reads `storage.getStore("schedules")` and polls `listDueSchedules`
 * every tick, so the gate wraps that one method of that one domain on this storage instance.
 * @param isEnabled the flag read (30 s cache, fallback `true`); a throw counts as on (fail open:
 *   the platform crons expire approvals and purge data).
 */
export const gateScheduleFires = <S extends MastraCompositeStore>(args: {
  readonly storage: S;
  readonly isEnabled: () => Promise<boolean>;
  readonly logger: Pick<Logger, "info">;
}): S => {
  const { storage } = args;
  const getStore = storage.getStore.bind(storage);
  const gated = new WeakMap<object, unknown>();
  let paused = false;
  const allowed = async (): Promise<boolean> => {
    const enabled = await args.isEnabled().catch(() => true);
    if (enabled === paused) {
      paused = !enabled;
      args.logger.info(paused ? "schedule_fires_paused" : "schedule_fires_resumed", { flag: "workflows.schedules" });
    }
    return enabled;
  };
  const gate = (store: SchedulesStore): unknown =>
    new Proxy(store, {
      get: (target, property) => {
        if (property === "listDueSchedules")
          return async (now: number, limit?: number) => ((await allowed()) ? target.listDueSchedules(now, limit) : []);
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === "function" ? (value as (...values: unknown[]) => unknown).bind(target) : value;
      },
    });
  const wrapped = async (name: string): Promise<unknown> => {
    const store = await getStore(name as Parameters<S["getStore"]>[0]);
    if (name !== "schedules" || store === undefined) return store;
    if (!gated.has(store)) gated.set(store, gate(store as SchedulesStore));
    return gated.get(store);
  };
  // An own property over the prototype method: Mastra keeps this instance and calls it per worker start.
  Object.defineProperty(storage, "getStore", { value: wrapped, configurable: true, writable: true });
  return storage;
};
