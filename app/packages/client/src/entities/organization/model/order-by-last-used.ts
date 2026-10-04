/**
 * Puts the last used organization first (`users.lastContext`, SP1), keeping the server order of
 * the rest, so the organizations page and switcher open on the likely choice.
 */
export const orderByLastUsed = <T extends { readonly id: string }>(
  items: readonly T[],
  lastUsedId: string | undefined,
): T[] => {
  const last = items.find((item) => item.id === lastUsedId);
  return last === undefined ? [...items] : [last, ...items.filter((item) => item !== last)];
};
