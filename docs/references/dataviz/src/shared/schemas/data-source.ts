import { z } from 'zod';
import { GcpProjectId, Slug } from './identifier';

/**
 * DataSource — referência para um projeto GCP acessível pelo sistema.
 *
 * Permite isolar clientes em projetos GCP distintos sem acoplar
 * credenciais a variáveis de ambiente.
 */
export const BigQueryLocation = z.enum([
  'US',
  'EU',
  'us-central1',
  'us-east1',
  'us-east4',
  'southamerica-east1',
  'europe-west1',
  'asia-northeast1',
]);

export const DataSourceDoc = z.object({
  name: z.string().min(2).max(80),
  projectId: GcpProjectId,
  location: BigQueryLocation.default('US'),
  description: z.string().max(500).optional().nullable(),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

export const DataSource = DataSourceDoc.extend({
  id: Slug,
});

export type BigQueryLocation = z.infer<typeof BigQueryLocation>;
export type DataSourceDoc = z.infer<typeof DataSourceDoc>;
export type DataSource = z.infer<typeof DataSource>;
