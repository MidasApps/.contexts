'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Product } from '@/shared/schemas';

type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;

async function authHeaders(): Promise<Record<string, string>> {
  const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
  const user = getFirebaseAuth().currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export function useAdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.fetch('/api/products', { headers: await authHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Erro ${res.status}`);
      setProducts((body.data ?? []) as Product[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (id: string, data: ProductInput) => {
    const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
    const res = await window.fetch('/api/products', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id, ...data }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || `Erro ${res.status}`);
    }
    // Refs de catálogo são soft (frente-A): warnings não bloqueiam o save,
    // só sinalizam refs órfãs como aviso não-bloqueante.
    if (Array.isArray(body.warnings) && body.warnings.length > 0) {
      toast.warning('Produto salvo com avisos', { description: body.warnings.join('\n') });
    }
    await refetch();
  }, [refetch]);

  const remove = useCallback(async (id: string) => {
    const res = await window.fetch(`/api/products?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Erro ${res.status}`);
    }
    await refetch();
  }, [refetch]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { products, loading, error, save, remove, refetch };
}
