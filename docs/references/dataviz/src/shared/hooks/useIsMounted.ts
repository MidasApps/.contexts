'use client';

import { useEffect, useState } from 'react';

/**
 * Retorna `true` somente após o componente ter montado no cliente.
 * Usado para evitar renderização de componentes que dependem do DOM
 * (ex: Recharts ResponsiveContainer) durante SSR/hydration do Next.js.
 */
export function useIsMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
