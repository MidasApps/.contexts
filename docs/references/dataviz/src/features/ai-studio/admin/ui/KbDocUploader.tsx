'use client';
import { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';

const ACCEPT = '.md,.txt,.pdf';
const MAX_BYTES = 10 * 1024 * 1024;

export function KbDocUploader({ onUpload }: { onUpload: (file: File) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr(null);
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) { setErr(`"${file.name}" excede 10 MB`); continue; }
      setBusy(true);
      try { await onUpload(file); }
      catch (e) { setErr(e instanceof Error ? e.message : 'Falha no upload'); }
      finally { setBusy(false); }
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => handleFiles(e.target.files)} />
      <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()} className="gap-1.5">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
        {busy ? 'Enviando...' : 'Enviar documento (.md/.txt/.pdf, ≤10MB)'}
      </Button>
      {err && <p className="text-[11px] text-destructive">{err}</p>}
    </div>
  );
}
