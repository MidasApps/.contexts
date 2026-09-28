'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

export interface JudgeVersionFilterProps {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}

const ALL_OPTION = '__all__';

export function JudgeVersionFilter({ value, options, onChange }: JudgeVersionFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Judge model:</span>
      <Select
        value={value || ALL_OPTION}
        onValueChange={(v) => onChange(v === ALL_OPTION ? '' : v)}
      >
        <SelectTrigger size="sm" className="min-w-[200px]" aria-label="Judge model version">
          <SelectValue placeholder="Todos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_OPTION}>Todos</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
