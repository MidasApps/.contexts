/**
 * Marca chunks legados de `embeddingsDocs` com a KB default.
 *
 * Ferramenta de RECUPERAÇÃO, não passo da carga: todo caminho do app grava
 * `knowledgeBaseId` (`upsertDoc` do `rag:ingest` o exige, e o upload da tela
 * de Knowledge Bases sempre gravou). Só há o que migrar ao restaurar um backup
 * de `embeddingsDocs` anterior às bases de conhecimento, ou se algo gravar na
 * coleção por fora desses caminhos.
 *
 * Grava por padrão: não há `--apply` nem modo dry-run. Por isso a trava de
 * produção trata toda execução como escrita — no banco `dataviz` ela exige
 * `--allow-prod`. `--dry-run` é recusado em vez de ignorado.
 *
 * Uso: pnpm migrate:embeddings-kb [--allow-prod]
 */
import { FieldPath } from 'firebase-admin/firestore';
import { DATAVIZ_DATABASE_ID } from '@/shared/lib/runtime-config';
import { getSeedDb } from './_firestore-admin';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';

const LABEL = 'migrate:embeddings-kb';

type Db = FirebaseFirestore.Firestore;

/** Página de leitura e de gravação: o limite de um batch do Firestore. */
const PAGE_SIZE = 500;

/**
 * Marca chunks legados (sem knowledgeBaseId) com a KB default. Idempotente.
 *
 * Lê em páginas pelo id do documento, só com o campo que decide, e grava cada
 * página num batch: a restauração de um backup é justamente o caso de muitos
 * documentos, e a versão anterior lia a coleção inteira e atualizava um a um.
 */
export const migrateEmbeddingsToKb = async (db: Db, kbId = 'default'): Promise<{ updated: number; skipped: number }> => {
  let updated = 0;
  let skipped = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db.collection('embeddingsDocs').select('knowledgeBaseId').orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const page = await q.get();
    if (page.empty) break;
    const batch = db.batch();
    let updatedInPage = 0;
    for (const doc of page.docs) {
      if (doc.get('knowledgeBaseId')) { skipped++; continue; }
      batch.update(doc.ref, { knowledgeBaseId: kbId });
      updatedInPage++;
    }
    if (updatedInPage > 0) await batch.commit();
    updated += updatedInPage;
    lastDoc = page.docs.at(-1);
    if (page.size < PAGE_SIZE) break;
  }
  return { updated, skipped };
};

async function main() {
  if (process.argv.includes('--dry-run')) {
    console.error(`[${LABEL}] RECUSADO: este script não tem modo dry-run; ele sempre grava. Remova --dry-run.`);
    process.exit(2);
  }
  // Writes by default, so the guard sees every run as `--apply`.
  assertSeedWriteAllowed({ databaseId: DATAVIZ_DATABASE_ID, argv: [...process.argv, '--apply'], label: LABEL });
  const db = getSeedDb();
  const r = await migrateEmbeddingsToKb(db);
  console.log(`[${LABEL}] updated=${r.updated} skipped=${r.skipped}`);
}

// Executa só quando rodado como script (não em import de teste).
if (process.argv[1] && process.argv[1].includes('migrate-embeddings-to-kb')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
