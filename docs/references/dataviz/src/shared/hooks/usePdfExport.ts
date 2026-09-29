'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { authJsonHeaders } from '@/shared/lib/auth/client-token';

interface UsePdfExportOptions {
  title?: string;
  elementId?: string;
}

function toRgb(color: string): string {
  if (!color || color === 'rgba(0, 0, 0, 0)' || color.startsWith('rgb')) return color;
  const cvs = document.createElement('canvas');
  cvs.width = 1; cvs.height = 1;
  const ctx = cvs.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return a === 255 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${(a / 255).toFixed(2)})`;
}

function inlineColors(original: Element, clone: Element) {
  if (!(original instanceof HTMLElement) || !(clone instanceof HTMLElement)) return;
  const cs = getComputedStyle(original);
  clone.style.setProperty('color', toRgb(cs.color), 'important');
  const bg = cs.backgroundColor;
  if (bg !== 'rgba(0, 0, 0, 0)') clone.style.setProperty('background-color', toRgb(bg), 'important');
  const bc = cs.borderColor;
  if (bc && bc !== 'rgb(0, 0, 0)' && bc !== 'rgba(0, 0, 0, 0)') {
    clone.style.setProperty('border-color', toRgb(bc), 'important');
  }
  if (cs.overflow !== 'visible') clone.style.setProperty('overflow', 'visible', 'important');
  if (original.tagName.toLowerCase() === 'svg') return;
  for (let i = 0; i < original.children.length && i < clone.children.length; i++) {
    inlineColors(original.children[i], clone.children[i]);
  }
}

export function usePdfExport(options: UsePdfExportOptions = {}) {
  const { title = 'Dashboard', elementId = 'dashboard-content' } = options;
  const [exporting, setExporting] = useState(false);

  const exportPdf = useCallback(async () => {
    const element = document.getElementById(elementId);
    if (!element) {
      console.warn(`[usePdfExport] Element #${elementId} not found`);
      return;
    }

    setExporting(true);
    const toastId = toast.loading('Gerando PDF...', { description: 'Isso pode levar alguns segundos.' });

    try {
      // Clone DOM and inline computed colors (oklch/lab → rgb)
      const clone = element.cloneNode(true) as HTMLElement;
      inlineColors(element, clone);
      const html = clone.innerHTML;

      // Collect stylesheets, unwrapping @layer blocks
      const styleTexts: string[] = [];
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            const text = rule.cssText;
            if (text.startsWith('@layer')) {
              const idx = text.indexOf('{');
              if (idx > 0) styleTexts.push(text.slice(idx + 1, text.lastIndexOf('}')));
            } else {
              styleTexts.push(text);
            }
          }
        } catch { /* cross-origin */ }
      }

      const res = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: await authJsonHeaders(),
        body: JSON.stringify({ html, title, styles: styleTexts.join('\n') }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Erro ${res.status}`);
      }

      const { url, filename } = await res.json();

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();

      toast.success('PDF gerado com sucesso!', { id: toastId });
    } catch (err) {
      console.error('[usePdfExport] Failed:', err);
      toast.error('Falha ao gerar PDF.', {
        id: toastId,
        description: err instanceof Error ? err.message : 'Tente novamente.',
      });
    } finally {
      setExporting(false);
    }
  }, [title, elementId]);

  return { exportPdf, exporting };
}
