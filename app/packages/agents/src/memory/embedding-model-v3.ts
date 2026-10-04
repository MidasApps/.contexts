import type { EmbeddingModelV4 } from "@ai-sdk/provider";
import type { MastraSupportedEmbeddingModel } from "@mastra/core/vector";

/** The v3 embedding model type Mastra bundles (its internal AI SDK v6 types). */
export type MastraEmbeddingModelV3 = Extract<
  MastraSupportedEmbeddingModel<string>,
  { readonly specificationVersion: "v3" }
>;

/**
 * `@mastra/memory` 1.32 embeds with AI SDK v2/v3 embedding models only
 * (`supportedEmbeddingModelSpecifications`), while the model factory builds v4
 * models (AI SDK 7). The two call contracts are the same shape, so memory gets
 * a v3 view of the same model (same provider, id, dimensions and options);
 * provider metadata and warnings are not carried (memory reads only the vectors).
 */
export const toEmbeddingModelV3 = (model: EmbeddingModelV4): MastraEmbeddingModelV3 => ({
  specificationVersion: "v3",
  provider: model.provider,
  modelId: model.modelId,
  maxEmbeddingsPerCall: model.maxEmbeddingsPerCall,
  supportsParallelCalls: model.supportsParallelCalls,
  doEmbed: async (options) => {
    const result = await model.doEmbed(options);
    return {
      embeddings: result.embeddings,
      ...(result.usage === undefined ? {} : { usage: result.usage }),
      ...(result.response === undefined ? {} : { response: result.response }),
      warnings: [],
    };
  },
});
