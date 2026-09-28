'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/shared/stores/app-store';
import type { Product } from '@/shared/schemas';

/**
 * Leitura read-only de `products/` para consumidores de UI (ex.: galeria de
 * templates). Não dispara fetch próprio: reaproveita o store já alimentado
 * pelo `useProducts()` montado em `Providers` (que escuta auth + `GET
 * /api/products`, liberado para qualquer usuário autenticado). Retorna
 * apenas produtos ativos, com `loading` derivado do `productsStatus`.
 */
export function useProductsList(): { products: Product[]; loading: boolean } {
  const products = useAppStore((s) => s.products);
  const productsStatus = useAppStore((s) => s.productsStatus);
  return { products, loading: productsStatus === 'idle' || productsStatus === 'loading' };
}

/**
 * Carrega os produtos cadastrados no Firestore e alimenta o store.
 * Monta listener em onAuthStateChanged, igual a useClients.
 */
export function useProducts() {
  useEffect(() => {
    let cancelled = false;

    async function setup() {
      const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
      const { onAuthStateChanged } = await import('firebase/auth');
      const auth = getFirebaseAuth();

      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (cancelled) return;

        if (!user) {
          useAppStore.getState().setProductsLoading();
          return;
        }

        useAppStore.getState().setProductsLoading();

        try {
          const token = await user.getIdToken();
          const res = await fetch('/api/products', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const body = await res.json().catch(() => ({}));
          if (cancelled) return;

          if (!res.ok) {
            throw new Error(body.error || `Erro ${res.status}`);
          }

          const products = (Array.isArray(body.data) ? body.data : []) as Product[];
          // Filtra apenas produtos ativos para navegação.
          const activeProducts = products.filter((p) => p.status === 'active');
          useAppStore.getState().setProducts(activeProducts);
        } catch (error) {
          if (cancelled) return;
          const msg = error instanceof Error ? error.message : 'Erro ao carregar produtos';
          useAppStore.getState().setProductsError(msg);
        }
      });

      return unsubscribe;
    }

    let unsubscribe: (() => void) | undefined;
    setup().then((unsub) => { unsubscribe = unsub; });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);
}
