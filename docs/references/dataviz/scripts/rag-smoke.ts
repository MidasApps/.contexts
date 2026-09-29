#!/usr/bin/env tsx
/**
 * RAG smoke (Sprint 2.A Task 13).
 *
 * - 20 queries "gold" com gabarito, todas no tenant vivo
 *   `expectedSourceContains` (substring esperada no `sourcePath` top-5).
 * - Mede recall@5 (alvo ≥ 0.8).
 * - Para cada query, repete com `clientId` errado e bloqueia (`adversarialFails`)
 *   se o mesmo source aparecer no recall — gate ADR-0006.
 *
 * Exit codes:
 *   0  smoke OK
 *   1  erro inesperado
 *   2  recall@5 abaixo do gate
 *   3  cross-tenant leak detectado
 */
import { embedTexts } from '@/shared/lib/rag/embeddings';
import { queryDocs } from '@/shared/lib/rag/rag-service';
import { rerank } from '@/shared/lib/rag/reranker';

interface GoldRow {
  query: string;
  clientId: string;
  expectedSourceContains: string;
}

const GOLD: GoldRow[] = [
  { query: 'O que define LTV em crédito imobiliário?', clientId: 'vila-rosa', expectedSourceContains: 'LTV' },
  { query: 'Como funciona PDD BACEN vs PDD projetada?', clientId: 'vila-rosa', expectedSourceContains: 'PDD' },
  { query: 'Regras de distrato pela Lei 13.786/2018', clientId: 'vila-rosa', expectedSourceContains: 'Distratos' },
  { query: 'Estrutura de CRI sob CVM 60', clientId: 'vila-rosa', expectedSourceContains: 'CRI' },
  { query: 'SBPE poupança aplicações imobiliárias', clientId: 'vila-rosa', expectedSourceContains: 'SBPE' },
  { query: 'Patrimônio de afetação SPE RET', clientId: 'vila-rosa', expectedSourceContains: 'SPE' },
  { query: 'Curva-S de venda no plano empresário', clientId: 'vila-rosa', expectedSourceContains: 'Curvas' },
  { query: 'INCC IPCA correção monetária', clientId: 'vila-rosa', expectedSourceContains: 'Correção' },
  { query: 'Open Finance crédito imobiliário', clientId: 'vila-rosa', expectedSourceContains: 'Open Finance' },
  { query: 'Personas mercado crédito imobiliário', clientId: 'vila-rosa', expectedSourceContains: 'Personas' },
  { query: 'Indicadores ABRAINC CBIC FipeZap', clientId: 'vila-rosa', expectedSourceContains: 'Benchmarks' },
  { query: 'Dados abertos MCMV', clientId: 'vila-rosa', expectedSourceContains: 'MCMV' },
  { query: 'LCI funding bancário', clientId: 'vila-rosa', expectedSourceContains: 'LCI' },
  { query: 'Selic curva juros impacto', clientId: 'vila-rosa', expectedSourceContains: 'Selic' },
  { query: 'SINAPI insumos construção', clientId: 'vila-rosa', expectedSourceContains: 'SINAPI' },
  { query: 'Registro imobiliário processos', clientId: 'vila-rosa', expectedSourceContains: 'Registro' },
  { query: 'HIS HMP certificação renda', clientId: 'vila-rosa', expectedSourceContains: 'Certificação' },
  { query: 'Repasse bancário processo obra', clientId: 'vila-rosa', expectedSourceContains: 'Repasse' },
  { query: 'Indicadores BACEN', clientId: 'vila-rosa', expectedSourceContains: 'Banco Central' },
  { query: 'Cenário macro real estate Brasil', clientId: 'vila-rosa', expectedSourceContains: 'Cenário Macro' },
];

async function main() {
  let hits = 0;
  const adversarial: { row: GoldRow; ok: boolean }[] = [];
  for (const row of GOLD) {
    const [emb] = await embedTexts([row.query]);
    if (!emb) continue;
    const cands = await queryDocs({ embedding: emb, topK: 20, clientId: row.clientId });
    const top5 = await rerank({
      query: row.query,
      candidates: cands.map((c) => ({ ...c })),
      topN: 5,
    });
    const matched = top5.some((h) => h.sourcePath.includes(row.expectedSourceContains));
    if (matched) hits++;

    // Adversarial: cross-tenant — must NOT recall the SAME source.
    // Com um tenant só, o "outro cliente" é um id sintético: o que a checagem
    // precisa é de um clientId DIFERENTE do da linha, não de um tenant real.
    const otherClient = `${row.clientId}-adversarial`;
    const advCands = await queryDocs({ embedding: emb, topK: 5, clientId: otherClient });
    const leaked = advCands.some((c) => c.sourcePath.includes(row.expectedSourceContains));
    adversarial.push({ row, ok: !leaked });
  }

  const recall = hits / GOLD.length;
  const advFails = adversarial.filter((a) => !a.ok).length;
  console.log(
    JSON.stringify({
      component: 'rag-smoke',
      recallAt5: recall,
      totalQueries: GOLD.length,
      adversarialFails: advFails,
    }),
  );
  if (recall < 0.8) {
    console.error(`FAIL: recall@5 ${recall} < 0.8`);
    process.exit(2);
  }
  if (advFails > 0) {
    console.error(`FAIL: cross-tenant leak in ${advFails} queries`);
    process.exit(3);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
