/**
 * A user in an admin list: the resolved name with the id as its tooltip, or the id alone (monospace)
 * while the name is unknown.
 */
export function AdminUserRef({ id, label }: { id: string; label: string }) {
  if (label === id) return <span className="font-mono text-[11.5px] break-all">{id}</span>;
  return <span title={id}>{label}</span>;
}
