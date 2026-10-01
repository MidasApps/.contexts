/** Local-storage key of the sidebar open state (a per-device UI preference, not server state). */
export const SIDEBAR_STATE_KEY = "core.desktop.sidebar-open";

type SidebarStorage = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

/** The saved sidebar state; open when nothing is saved or storage is unavailable. */
export const readSidebarOpen = (storage: SidebarStorage | undefined): boolean => {
  try {
    return storage?.getItem(SIDEBAR_STATE_KEY) !== "false";
  } catch {
    // Storage can be blocked (private mode, policy): the default is fine.
    return true;
  }
};

/** Saves the sidebar state; a blocked storage only loses the preference. */
export const writeSidebarOpen = (storage: SidebarStorage | undefined, open: boolean): void => {
  try {
    storage?.setItem(SIDEBAR_STATE_KEY, String(open));
  } catch {
    // Same as above: losing a UI preference is not an error worth reporting.
  }
};
