import { tool } from 'ai';
import { z } from 'zod';

export const SuggestInputSchema = z.object({
  intent: z.enum(['forecast', 'clustering', 'classification', 'anomaly']),
  target: z.string().nullable(),
  timeColumn: z.string().nullable(),
  knownFeatures: z.array(z.string()).default([]),
  rowCount: z.number().int().nonnegative().default(100_000),
});

export type SuggestInput = z.infer<typeof SuggestInputSchema>;

export interface ModelDecision {
  modelType:
    | 'ARIMA_PLUS'
    | 'KMEANS'
    | 'LOGISTIC_REG'
    | 'BOOSTED_TREE_CLASSIFIER'
    | 'BOOSTED_TREE_REGRESSOR'
    | 'AUTOENCODER';
  templateKind: 'forecast' | 'clustering' | 'classification' | 'anomaly';
  ddlVariant:
    | 'arima_plus'
    | 'boosted_tree_regressor'
    | 'kmeans'
    | 'logistic_reg'
    | 'boosted_tree_classifier'
    | 'autoencoder'
    | 'arima_plus_anomaly';
}

export function decideModelType(input: SuggestInput): ModelDecision {
  if (input.intent === 'forecast') {
    if (input.timeColumn) {
      return { modelType: 'ARIMA_PLUS', templateKind: 'forecast', ddlVariant: 'arima_plus' };
    }
    return {
      modelType: 'BOOSTED_TREE_REGRESSOR',
      templateKind: 'forecast',
      ddlVariant: 'boosted_tree_regressor',
    };
  }
  if (input.intent === 'clustering') {
    return { modelType: 'KMEANS', templateKind: 'clustering', ddlVariant: 'kmeans' };
  }
  if (input.intent === 'classification') {
    if (input.rowCount < 1_000_000) {
      return {
        modelType: 'LOGISTIC_REG',
        templateKind: 'classification',
        ddlVariant: 'logistic_reg',
      };
    }
    return {
      modelType: 'BOOSTED_TREE_CLASSIFIER',
      templateKind: 'classification',
      ddlVariant: 'boosted_tree_classifier',
    };
  }
  // anomaly
  if (input.timeColumn) {
    return {
      modelType: 'ARIMA_PLUS',
      templateKind: 'anomaly',
      ddlVariant: 'arima_plus_anomaly',
    };
  }
  return { modelType: 'AUTOENCODER', templateKind: 'anomaly', ddlVariant: 'autoencoder' };
}

const PASSES: Record<ModelDecision['modelType'], number> = {
  ARIMA_PLUS: 5,
  KMEANS: 10,
  LOGISTIC_REG: 20,
  BOOSTED_TREE_CLASSIFIER: 50,
  BOOSTED_TREE_REGRESSOR: 50,
  AUTOENCODER: 30,
};

const PRICE_PER_TB: Record<ModelDecision['modelType'], number> = {
  ARIMA_PLUS: 250,
  KMEANS: 6.25,
  LOGISTIC_REG: 6.25,
  BOOSTED_TREE_CLASSIFIER: 6.25,
  BOOSTED_TREE_REGRESSOR: 6.25,
  AUTOENCODER: 6.25,
};

export interface CostEstimate {
  bytes: number;
  costUsd: number;
  estimatedTrainMinutes: number;
}

/** Custo de treino (US$) para `bytes` processados, na tarifa do tipo de modelo. */
export function trainCostUsd(bytes: number, modelType: ModelDecision['modelType']): number {
  return (bytes / 1e12) * PRICE_PER_TB[modelType];
}

export function estimateCost(args: {
  rowCount: number;
  rowWidthBytes: number;
  modelType: ModelDecision['modelType'];
}): CostEstimate {
  const passes = PASSES[args.modelType];
  const bytes = args.rowCount * args.rowWidthBytes * passes;
  const costUsd = (bytes / 1e12) * PRICE_PER_TB[args.modelType];
  const estimatedTrainMinutes = Math.max(1, Math.round((bytes / 1e9) * 1.5));
  return { bytes, costUsd, estimatedTrainMinutes };
}

export function createBqmlSuggestModelTool() {
  return tool({
    description:
      'Sugere o tipo de modelo BQML adequado dado intent (forecast/clustering/classification/anomaly) + dados disponíveis. Retorna template + estimativa de bytes/custo/duração.',
    inputSchema: SuggestInputSchema,
    execute: async (input) => {
      const decision = decideModelType(input);
      const cost = estimateCost({
        rowCount: input.rowCount,
        rowWidthBytes: 100,
        modelType: decision.modelType,
      });
      return {
        ...decision,
        suggestedFeatures: input.knownFeatures,
        ...cost,
      };
    },
  });
}
