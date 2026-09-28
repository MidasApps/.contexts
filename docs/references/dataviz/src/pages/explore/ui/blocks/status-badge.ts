/**
 * Resolve a variante semântica de um badge de status a partir do valor
 * bruto da célula. `statusMap` (por coluna) tem prioridade sobre os
 * defaults PT-BR; valores não mapeados caem em 'neutral'.
 */
export type StatusVariant = 'success' | 'danger' | 'warning' | 'neutral';

const DEFAULTS: Record<string, StatusVariant> = {
  'Válida': 'success',
  'Inválida': 'danger',
  'Vencida': 'danger',
  'Pendente': 'warning',
};

export function resolveStatusVariant(
  value: string,
  statusMap?: Record<string, StatusVariant>,
): StatusVariant {
  return statusMap?.[value] ?? DEFAULTS[value] ?? 'neutral';
}
