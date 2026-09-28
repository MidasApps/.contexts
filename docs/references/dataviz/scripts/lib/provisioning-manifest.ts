/**
 * O que constitui "provisionamento" — e, sobretudo, o que NÃO constitui.
 *
 * Fonte única do export (`export-provisioning`) e do seed
 * (`seed-provisioning`). Os dois lêem daqui para que seja impossível exportar
 * uma coleção que o seed não sabe restaurar, ou vice-versa.
 *
 * Achado R14 da revisão de 2026-08-04: os seeds que criavam a base do zero
 * foram removidos na purga; os que sobraram só ESTENDEM uma base existente e
 * abortam se ela não existir. O repositório deixou de reprovisionar.
 */

export interface ProvisionedCollection {
  /** Nome da coleção raiz no Firestore. */
  name: string;
  /**
   * Subcoleções a seguir, em profundidade. Caminho relativo ao documento pai,
   * podendo encadear (`groups/reports` = groups/{g}/reports/{r}).
   */
  subcollections?: string[];
  /** Por que faz parte do provisionamento. */
  reason: string;
}

/**
 * CONFIGURAÇÃO — o que precisa existir para a aplicação subir do zero.
 * Tudo aqui é escrito por administradores, não por usuários finais.
 */
export const CONFIG_COLLECTIONS: ProvisionedCollection[] = [
  {
    name: 'clients',
    subcollections: ['groups', 'groups/reports'],
    reason: 'O tenant e suas páginas de relatório (ADR-0018).',
  },
  {
    name: 'dataContracts',
    subcollections: ['entities', 'entities/attributes'],
    reason: 'Vocabulário canônico da camada semântica (ADR-0015).',
  },
  { name: 'products', reason: 'Agrupa métricas contratadas por produto.' },
  { name: 'metrics', reason: 'Catálogo de KPIs/gráficos/tabelas.' },
  { name: 'relations', reason: 'Joins declarados entre entidades do contrato.' },
  { name: 'dataSources', reason: 'Origem BigQuery por cliente.' },
  { name: 'groups', reason: 'Grupos de permissão (rotas liberadas).' },
  { name: 'dashboardTemplates', reason: 'Templates de relatório importáveis.' },
  { name: 'aiAgents', reason: 'Configuração de agente — canônica em banco (ADR-0017).' },
  { name: 'aiSkills', reason: 'Habilidades que os agentes compõem — canônicas em banco (ADR-0017).' },
  { name: 'aiWorkflows', reason: 'Roteamento do supervisor; sem isso o chat cai no agente padrão (ADR-0019).' },
  { name: 'knowledgeBases', reason: 'Metadados das bases de conhecimento — os EMBEDDINGS em si ficam de fora (PII).' },
];

/**
 * NUNCA EXPORTADAS. A lista existe para ser lida, não só para filtrar.
 *
 * Um clone de produção que arrasta estas coleções deixa de ser "ambiente de
 * desenvolvimento" e passa a ser uma segunda cópia de dado pessoal, sujeita às
 * mesmas obrigações de retenção e eliminação da LGPD — só que sem o controle
 * de acesso do ambiente original.
 *
 * Consequência de `users` estar aqui: um ambiente reprovisionado do zero sobe
 * completo e sem ninguém que consiga entrar. Isso é o desenho funcionando, não
 * uma falha — e o caminho de saída é CRIAR o primeiro usuário, nunca copiar:
 * `pnpm provisioning:bootstrap-user`.
 */
export const FORBIDDEN_COLLECTIONS: Record<string, string> = {
  users: 'PII: e-mail, nome e o vínculo pessoa↔cliente. Além disso arrastaria permissões reais para um ambiente de teste.',
  workingMemory: 'Memória de conversa — carrega dado de devedor citado no chat (ADR-0006/0011).',
  embeddingsDocs: 'Embeddings de documento: PII de devedores (CPF, contrato, valores).',
  embeddingsSql: 'Embeddings de SQL: expõem as consultas reais feitas sobre a carteira do cliente.',
  embeddingsBlocks: 'Embeddings de bloco: carregam recorte de dado de carteira usado para montar o painel.',
  sqlCatalog: 'Histórico de consultas reais sobre carteira de cliente.',
  sqlCatalogEvents: 'Telemetria de uso do catálogo em produção; não é configuração e não reprovisiona nada.',
  evalRuns: 'Execuções de avaliação sobre dado real; não é configuração.',
  judgeDrift: 'Série temporal de produção; não é configuração.',
  conversations: 'Histórico de chat: `messages` carrega a análise da carteira do cliente, e `userId` liga à pessoa.',
};

/**
 * Coleções que entram APENAS em backup, nunca em clone.
 *
 * A distinção é o ponto: `FORBIDDEN_COLLECTIONS` protege contra *clonar* PII para
 * um ambiente de teste. Um BACKUP antes de deleção tem o requisito oposto — se
 * ele não incluir o que vai ser apagado, a deleção é irreversível.
 *
 * Por isso o export tem dois modos, e o modo completo grava em diretório
 * git-ignorado: o mesmo dado que é obrigatório num backup é proibido num clone.
 */
export const BACKUP_ONLY_COLLECTIONS: string[] = Object.keys(FORBIDDEN_COLLECTIONS);

/** Coleções cujo conteúdo é global (não pertence a um cliente específico). */
export const GLOBAL_COLLECTIONS = new Set([
  'dataContracts', 'products', 'metrics', 'relations',
  'dashboardTemplates', 'aiAgents', 'aiSkills', 'aiWorkflows', 'knowledgeBases',
]);

/**
 * Banco de PRODUÇÃO. O seed se recusa a escrever aqui sem `--allow-prod`.
 *
 * Fica explícito e não derivado de env: se viesse de `DATAVIZ_DATABASE_ID`, um
 * `.env` mal configurado apontaria a proteção para o banco errado — e a
 * proteção existe exatamente para o caso em que a configuração está errada.
 */
export const PRODUCTION_DATABASE = 'dataviz';
