import { tool } from 'ai';
import { z } from 'zod';
import { getBigQueryClient } from '@/shared/lib/bigquery/client';
import { deriveBqmlDataset, assertClientMatchesDataset } from './multi-tenancy';
import {
  lookupCachedModel,
  recordModelInRegistry,
  bumpUsage,
  computeModelHash,
  computeFeaturesCanonical,
  computeSourceColumnsDdlHash,
} from './cache';
import { decideModelType, trainCostUsd } from './suggest-model';
import { buildForecastDdl } from './templates/forecast';
import { buildClusteringDdl } from './templates/clustering';
import { buildClassificationDdl } from './templates/classification';
import { buildAnomalyDdl } from './templates/anomaly';
import { logBqmlInvocation } from './invocation-logger';
import { checkTenantQuery, tenantDefaultDataset, type QueryScope, type TenantQueryRefusalCode } from '@/features/ai-agents/lib/tenant-query';
import { lazyClientQueryScope } from '@/features/ai-agents/lib/client-query-scope';
import { safeColumn } from '@/features/ai-agents/tools/bqml-utils';
import { maxBytesBilled, approvalBytesThreshold, BYTES_CAP_TOOL_MESSAGE } from '@/shared/lib/bigquery/cost-guard';
import { formatToolError } from '@/features/ai-agents/lib/format-error';

/** Tipos que `decideModelType` produz. Opção vinda do modelo é allow-list, nunca string livre. */
const BQML_MODEL_TYPES = [
  'ARIMA_PLUS',
  'KMEANS',
  'LOGISTIC_REG',
  'BOOSTED_TREE_CLASSIFIER',
  'BOOSTED_TREE_REGRESSOR',
  'AUTOENCODER',
] as const;

const InputSchema = z.object({
  intent: z.enum(['forecast', 'clustering', 'classification', 'anomaly']),
  features: z.array(z.string()).min(1),
  target: z.string().nullable(),
  sourceQuery: z.string().min(1).describe(
    'Um único SELECT (ou WITH) sobre as tabelas do cliente, sem nome de dataset (ex.: FROM contratos). '
    + 'DML, DDL, scripting e múltiplos comandos são recusados, assim como tabelas de outro dataset.',
  ),
  sourceColumns: z.array(
    z.object({ name: z.string(), type: z.string(), mode: z.string().nullable() }),
  ),
  safraWindowEnd: z.string().nullable(),
  // Hoje nenhum dos dois entra no DDL (o tipo vem de `decideModelType`). O enum
  // garante que, se um dia entrar, não seja texto livre do modelo.
  modelTypeOverride: z.enum(BQML_MODEL_TYPES).nullable(),
  ddlOptions: z.record(z.string(), z.unknown()).nullable(),
}).strict();

type Input = z.infer<typeof InputSchema>;

interface ToolCtx {
  clientId: string;
  /** Dataset de dados do tenant, já autorizado pela rota (ADR-0006). Escopo do `sourceQuery`. */
  dataset: string;
  sessionId: string;
  agentId: string;
}

function buildDdl(input: Input, dataset: string, modelName: string): string {
  const decision = decideModelType({
    intent: input.intent,
    target: input.target,
    timeColumn: null,
    knownFeatures: input.features,
    rowCount: 100_000,
  });
  switch (decision.templateKind) {
    case 'forecast':
      return buildForecastDdl({
        kind: decision.ddlVariant === 'arima_plus' ? 'arima_plus' : 'boosted_tree_regressor',
        dataset,
        modelName,
        target: input.target ?? 'value',
        timeColumn: input.features[0] ?? 'ts',
        horizon: 12,
        features: input.features,
        sourceQuery: input.sourceQuery,
      });
    case 'clustering':
      return buildClusteringDdl({
        dataset,
        modelName,
        features: input.features,
        sourceQuery: input.sourceQuery,
      });
    case 'classification':
      return buildClassificationDdl({
        kind: decision.ddlVariant === 'logistic_reg' ? 'logistic_reg' : 'boosted_tree_classifier',
        dataset,
        modelName,
        target: input.target ?? 'label',
        features: input.features,
        sourceQuery: input.sourceQuery,
      });
    case 'anomaly':
      return buildAnomalyDdl({
        kind: decision.ddlVariant === 'autoencoder' ? 'autoencoder' : 'arima_plus_anomaly',
        dataset,
        modelName,
        target: input.target ?? undefined,
        timeColumn: undefined,
        sourceQuery: input.sourceQuery,
      });
  }
}

type RefusalCode = TenantQueryRefusalCode | 'IDENTIFICADOR_INVALIDO' | 'ACIMA_DO_TETO';

type Prepared =
  | { ok: true; ddl: string; bytes: number }
  | { ok: false; code: RefusalCode; error: string };

/**
 * Monta o DDL só depois de validar tudo que vem do modelo:
 * - colunas (features/target) contra a allow-list de `safeColumn`;
 * - `sourceQuery` pela mesma guarda do `execute_sql` + dry-run com escopo de
 *   tenant (`checkTenantQuery`).
 * O dataset e o nome do modelo não vêm do input: são derivados do tenant e do
 * hash. Recusa aqui significa que NENHUM job real é criado.
 */
async function prepareDdl(
  input: Input,
  ctx: ToolCtx,
  modelName: string,
  scope: () => Promise<QueryScope>,
): Promise<Prepared> {
  try {
    [...input.features, ...(input.target ? [input.target] : [])].forEach((c) => safeColumn(c));
  } catch (err) {
    return { ok: false, code: 'IDENTIFICADOR_INVALIDO', error: err instanceof Error ? err.message : String(err) };
  }

  const check = await checkTenantQuery(input.sourceQuery, scope);
  if (!check.ok) return check;
  // Estimativa acima do teto: o BigQuery recusaria o job de qualquer jeito
  // (`maximumBytesBilled`). Recusa aqui, sem job e sem pedir aprovação que
  // não teria o que aprovar.
  if (check.bytes > maxBytesBilled()) return { ok: false, code: 'ACIMA_DO_TETO', error: BYTES_CAP_TOOL_MESSAGE };

  try {
    // Quebra de linha no fim: um comentário `--` no fim da query não engole o
    // `)`/`;` que o template põe depois dela.
    const ddl = buildDdl({ ...input, sourceQuery: `${check.sql}\n` }, deriveBqmlDataset(ctx.clientId), modelName);
    return { ok: true, ddl, bytes: check.bytes };
  } catch (err) {
    return { ok: false, code: 'IDENTIFICADOR_INVALIDO', error: err instanceof Error ? err.message : String(err) };
  }
}

const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = Number(process.env.BQML_TIMEOUT ?? 180_000);

export function createBqmlCreateOrUseModelTool(ctx: ToolCtx) {
  // Datasets vinculados ao cliente, lidos do Firestore no servidor (ADR-0006).
  const scope = lazyClientQueryScope({ clientId: ctx.clientId, dataset: ctx.dataset });
  return tool({
    description:
      'Cria ou reusa modelo BQML para o intent informado. Cache via dataviz_meta.bqml_model_registry com hash determinístico. '
      + 'Pede aprovação quando os bytes estimados passam do limiar de aprovação ou o custo passa de US$ 5; '
      + 'acima do teto de bytes o treino é recusado. Yield preliminary results durante training.',
    inputSchema: InputSchema,
    needsApproval: async (input: Input) => {
      const modelName = `bqml_${input.intent}_approval`;
      const prep = await prepareDdl(input, ctx, modelName, scope);
      if (!prep.ok) {
        // Fail closed no custo: a recusa genérica (FORA_DO_TENANT) cobre também
        // o dry-run que falhou por instabilidade — sem estimativa, e estimativa
        // desconhecida NÃO é zero, então pede aprovação (o execute refaz o
        // dry-run). As demais recusas são determinísticas: o execute recusa
        // sem rodar nada, e perguntar ao usuário não teria o que aprovar.
        return prep.code === 'FORA_DO_TENANT';
      }
      const bytes = prep.bytes;
      const decision = decideModelType({
        intent: input.intent,
        target: input.target,
        timeColumn: null,
        knownFeatures: input.features,
        rowCount: 100_000,
      });
      // Limiar sempre abaixo do teto (`approvalBytesThreshold`): o que passa
      // daqui pede aprovação e ainda cabe no teto do job.
      const bytesGate = bytes > approvalBytesThreshold();
      // Gate em US$ (ADR-0007) sobre os bytes do dry-run, na tarifa do modelo.
      // A estimativa antiga (100 000 linhas × 100 bytes fixos) nunca passava de
      // centavos. Com o teto padrão de 5 GiB o treino custa no máximo ~US$ 1,3
      // (ARIMA_PLUS, US$ 250/TB), então o gate só age com BQ_MAX_BYTES_BILLED
      // mais alto — é ele que segura o custo quando o teto sobe.
      const costGate = trainCostUsd(bytes, decision.modelType) > Number(process.env.BQML_APPROVAL_COST_USD ?? 5);
      return bytesGate || costGate;
    },
    async *execute(input: Input) {
      const t0 = Date.now();
      const dataset = deriveBqmlDataset(ctx.clientId);
      const featuresCanonical = computeFeaturesCanonical(input.features);
      const sourceColumnsDdlHash = computeSourceColumnsDdlHash(
        input.sourceColumns.map((c) => ({
          name: c.name,
          type: c.type,
          mode: c.mode ?? undefined,
        })),
      );
      const hash = computeModelHash({
        clientId: ctx.clientId.toLowerCase(),
        intent: input.intent,
        featuresCanonical,
        target: input.target ?? '',
        safraWindowEnd: input.safraWindowEnd ?? '',
        sourceColumnsDdlHash,
      });

      const cached = await lookupCachedModel(hash, ctx.clientId.toLowerCase());
      if (cached) {
        assertClientMatchesDataset(ctx.clientId, cached.modelRef);
        await bumpUsage(hash, ctx.clientId.toLowerCase());
        Promise.resolve(
          logBqmlInvocation({
            clientId: ctx.clientId,
            sessionId: ctx.sessionId,
            agentId: ctx.agentId,
            toolName: 'bqml.create_or_use_model',
            intent: input.intent,
            hash,
            modelRef: cached.modelRef,
            cacheHit: true,
            durationMs: Date.now() - t0,
            success: true,
          }),
        ).catch(() => {});
        yield {
          status: 'ready' as const,
          cacheHit: true,
          modelRef: cached.modelRef,
          modelType: cached.modelType,
        };
        return;
      }

      const modelName = `bqml_${input.intent}_${hash.slice(0, 8)}`;
      const modelRef = `${dataset}.${modelName}`;

      // O execute valida por conta própria: nem todo runtime chama
      // `needsApproval` antes, e a aprovação é gate de custo, não de segurança.
      const prep = await prepareDdl(input, ctx, modelName, scope);
      if (!prep.ok) {
        Promise.resolve(
          logBqmlInvocation({
            clientId: ctx.clientId,
            sessionId: ctx.sessionId,
            agentId: ctx.agentId,
            toolName: 'bqml.create_or_use_model',
            intent: input.intent,
            hash,
            modelRef,
            cacheHit: false,
            durationMs: Date.now() - t0,
            success: false,
            error: `${prep.code}: ${prep.error}`,
          }),
        ).catch(() => {});
        yield { status: 'refused' as const, code: prep.code, error: prep.error };
        return;
      }
      const { ddl } = prep;
      const dryRunBytes = prep.bytes;
      yield {
        status: 'training' as const,
        progress: 0,
        etaMs: TIMEOUT_MS,
        bytesEstimated: dryRunBytes,
      };

      const [job] = await getBigQueryClient().createQueryJob({
        query: ddl,
        useLegacySql: false,
        // Nomes não qualificados do sourceQuery resolvem no dataset do tenant.
        defaultDataset: tenantDefaultDataset(ctx.dataset),
        // Teto duro de cobrança (rules/cost.md): coexistente com a aprovação.
        maximumBytesBilled: String(maxBytesBilled()),
      });

      const start = Date.now();
      let bytesBilled = 0;
      let finalState: string | undefined;
      let errorResult: { message?: string } | undefined;
      while (Date.now() - start < TIMEOUT_MS) {
        const [meta] = await job.getMetadata();
        finalState = meta?.status?.state;
        errorResult = meta?.status?.errorResult;
        bytesBilled = Number(meta?.statistics?.totalBytesBilled ?? 0);
        if (finalState === 'DONE') break;
        const elapsed = Date.now() - start;
        yield {
          status: 'training' as const,
          progress: Math.min(0.95, elapsed / TIMEOUT_MS),
          etaMs: TIMEOUT_MS - elapsed,
          bytesEstimated: dryRunBytes,
        };
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }

      // Só registra o modelo se o job terminou com DONE e sem erro. Em timeout
      // (loop expira sem DONE) ou falha do job, NÃO gravar no registry — senão um
      // modelo inexistente/quebrado virava cache-hit 'ready' permanente via
      // lookupCachedModel. Loga a falha e propaga o erro para a tool.
      if (finalState !== 'DONE' || errorResult) {
        const reason =
          errorResult?.message ??
          (finalState !== 'DONE'
            ? `treino não finalizou em ${TIMEOUT_MS}ms (state=${finalState ?? 'desconhecido'})`
            : 'falha no job de treino BQML');
        Promise.resolve(
          logBqmlInvocation({
            clientId: ctx.clientId,
            sessionId: ctx.sessionId,
            agentId: ctx.agentId,
            toolName: 'bqml.create_or_use_model',
            intent: input.intent,
            hash,
            modelRef,
            cacheHit: false,
            bytesEstimated: dryRunBytes,
            bytesProcessed: bytesBilled,
            durationMs: Date.now() - t0,
            success: false,
            error: reason,
          }),
        ).catch(() => {});
        throw new Error(`bqml.create_or_use_model: ${formatToolError(new Error(reason))}`);
      }

      const decision = decideModelType({
        intent: input.intent,
        target: input.target,
        timeColumn: null,
        knownFeatures: input.features,
        rowCount: 100_000,
      });
      const cost = (bytesBilled / 1e12) * (decision.modelType === 'ARIMA_PLUS' ? 250 : 6.25);

      await recordModelInRegistry({
        hash,
        clientId: ctx.clientId.toLowerCase(),
        intent: input.intent,
        modelType: decision.modelType,
        modelRef,
        featuresCanonical,
        target: input.target,
        safraWindowEnd: input.safraWindowEnd,
        sourceColumnsDdlHash,
        trainBytes: bytesBilled,
        trainCostUsd: cost,
        metricsJson: {},
      });

      Promise.resolve(
        logBqmlInvocation({
          clientId: ctx.clientId,
          sessionId: ctx.sessionId,
          agentId: ctx.agentId,
          toolName: 'bqml.create_or_use_model',
          intent: input.intent,
          hash,
          modelRef,
          cacheHit: false,
          bytesEstimated: dryRunBytes,
          bytesProcessed: bytesBilled,
          costUsd: cost,
          durationMs: Date.now() - t0,
          success: true,
        }),
      ).catch(() => {});

      yield {
        status: 'ready' as const,
        cacheHit: false,
        modelRef,
        modelType: decision.modelType,
        bytesProcessed: bytesBilled,
        costUsd: cost,
      };
    },
  });
}
