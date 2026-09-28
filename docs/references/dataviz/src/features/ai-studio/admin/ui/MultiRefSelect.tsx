'use client';
interface Option { id: string; label: string }
interface Props { label: string; options: Option[]; value: string[]; onChange: (v: string[]) => void }

export function MultiRefSelect({ label, options, value, onChange }: Props) {
  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }
  const known = new Set(options.map((o) => o.id));
  const orphans = value.filter((v) => !known.has(v));
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium">{label}</label>
      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto rounded-md border border-border p-2">
        {options.map((o) => (
          <button type="button" key={o.id} onClick={() => toggle(o.id)}
            className={`text-[11px] px-2 py-0.5 rounded-full border ${value.includes(o.id) ? 'bg-primary/15 text-primary border-primary/40' : 'border-border text-muted-foreground'}`}>
            {o.label}
          </button>
        ))}
      </div>
      {orphans.length > 0 && (
        <p className="text-[11px] text-amber-500">Refs órfãs (mantidas, mas inexistentes): {orphans.join(', ')}</p>
      )}
    </div>
  );
}
