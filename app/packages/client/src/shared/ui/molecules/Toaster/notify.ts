import { toast } from "sonner";

export type NotifyOptions = {
  description?: string;
  /** One action (e.g. "Undo", "Retry"); the label must be translated by the caller. */
  action?: { label: string; onClick: () => void };
  id?: string | number;
};

// Only defined keys reach sonner (exactOptionalPropertyTypes: its options reject explicit undefined).
const withAction = ({ description, action, id }: NotifyOptions) => ({
  ...(description === undefined ? {} : { description }),
  ...(action === undefined ? {} : { action }),
  ...(id === undefined ? {} : { id }),
});

/**
 * Toast helpers with the design-system timing (toasts.html): success/info 4 s, warnings 8 s,
 * errors persist until dismissed (with a close button) because they need action. Titles and
 * descriptions are already-translated strings; never raw API messages (use `errors.<CODE>`).
 */
export const notify = {
  success: (title: string, options: NotifyOptions = {}) => toast.success(title, withAction(options)),
  info: (title: string, options: NotifyOptions = {}) => toast.info(title, withAction(options)),
  warning: (title: string, options: NotifyOptions = {}) =>
    toast.warning(title, { ...withAction(options), duration: 8000 }),
  error: (title: string, options: NotifyOptions = {}) =>
    toast.error(title, { ...withAction(options), duration: Number.POSITIVE_INFINITY, closeButton: true }),
  dismiss: (id?: string | number) => toast.dismiss(id),
};
