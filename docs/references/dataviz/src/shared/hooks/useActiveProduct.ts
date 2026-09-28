'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/shared/stores/app-store';
import type { Metric, Product } from '@/shared/schemas';

/**
 * Produto ativo corrente. Fallback para o primeiro da lista se não houver
 * selecionado explicitamente.
 */
export function useActiveProduct(): Product | null {
  const activeProductId = useAppStore((s) => s.activeProductId);
  const products = useAppStore((s) => s.products);
  return useMemo(() => {
    if (products.length === 0) return null;
    if (!activeProductId) return products[0] ?? null;
    return products.find((p) => p.id === activeProductId) ?? products[0] ?? null;
  }, [activeProductId, products]);
}

// useActiveProductRoutes e useActiveProductIndicators saíram junto com os
// editores do admin que eram seus únicos consumidores (ProductRoutesEditor e
// ProductIndicatorsEditor, removidos por serem inalcançáveis). O segundo já
// estava @deprecated em favor de useActiveProductMetrics (ADR-0015).

/**
 * Métricas que o produto ativo oferece (ADR-0015).
 *
 * Estratégia de resolução:
 * 1. Se `product.metricRefs` está populado → joina com `metrics/*` carregadas no store.
 * 2. Caso contrário, fallback para `product.indicators` legado (formato `ProductIndicator`,
 *    apenas leitura — converte para shape `Metric`-compatível com campos preenchidos
 *    com defaults razoáveis).
 *
 * Esse fallback permite coexistência: produtos não migrados continuam funcionando.
 */
export function useActiveProductMetrics(): Metric[] {
  const product = useActiveProduct();
  const metrics = useAppStore((s) => s.metrics);

  return useMemo(() => {
    if (!product) return [];

    // Caminho novo: refs explícitas.
    if (product.metricRefs && product.metricRefs.length > 0) {
      const wanted = new Set(product.metricRefs);
      return metrics.filter((m) => wanted.has(m.id));
    }

    // Fallback legado: converte ProductIndicator → Metric-like.
    const legacy = product.indicators ?? [];
    if (legacy.length === 0) return [];
    return legacy.map((ind): Metric => ({
      id: ind.id,
      label: ind.label,
      description: null,
      type: ind.type,
      category: ind.page,
      unit: null,
      // ProductIndicator usa `tabela.campo` (2 segmentos); Metric exige 3 segmentos.
      // Prefixa com "canonical" para satisfazer o shape; consumidores que validam
      // refs devem tratar produtos legados como "não validáveis".
      requires: ind.requiredFields.map((rf) => `canonical.${rf}`),
      version: '1.0.0',
      status: 'active',
      ownerClientId: null,
      createdAt: null,
      updatedAt: null,
    }));
  }, [product, metrics]);
}

/**
 * Produtos disponíveis para o cliente ativo.
 * - Cliente com productBindings: só produtos assinados.
 * - Cliente legacy (sem bindings): todos os produtos ativos.
 */
export function useAvailableProducts(): Product[] {
  const products = useAppStore((s) => s.products);
  const activeClientId = useAppStore((s) => s.activeClientId);
  const clients = useAppStore((s) => s.clients);

  return useMemo(() => {
    const client = clients.find((c) => c.id === activeClientId);
    if (!client) return products;
    const bindings = client.productBindings ?? [];
    if (bindings.length === 0) return products;
    const assigned = new Set(bindings.map((b) => b.productId));
    return products.filter((p) => assigned.has(p.id));
  }, [products, activeClientId, clients]);
}
