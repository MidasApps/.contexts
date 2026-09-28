import type { ClientSemanticContext } from '@/shared/repositories/client-semantic-context';

/**
 * O que as ferramentas de autoria precisam saber do SERVIDOR.
 *
 * Nada aqui vem do input do modelo (ADR-0006): o texto do usuário chega ao
 * modelo e não pode virar endereço de escrita em outro tenant, nem identidade
 * de outra pessoa.
 */
export interface ServerContext {
  /** Tenant dono da métrica. */
  clientId?: string;
  /** Quem está na conversa — o gate de dataset do dry-run é por pessoa. */
  userEmail?: string;
  /** Relatório e página abertos: definem o que é "só esta página usa". */
  activeGroupId?: string;
  activeReportId?: string;
  semanticContext?: ClientSemanticContext;
  /**
   * Anexa a métrica ao catálogo que as tools de bloco conferem NESTE turno.
   * Ausente quando não há catálogo (a guarda de bloco fica soft).
   */
  registerMetric?: (metricId: string) => void;
}
