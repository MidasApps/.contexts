/**
 * `force-dynamic` no próprio segmento, não só no root layout.
 *
 * Este relatório nunca poderia ser estático: o `blockMap` vem do Firestore por
 * cliente e os dados vêm por requisição autenticada. A declaração aqui só
 * torna explícito o que o `app/layout.tsx` já impõe ao app inteiro (por causa
 * do nonce de CSP) e tira a rota do caminho de geração estática.
 *
 * O caminho de geração estática é onde o dev server foi visto morrer:
 *
 *   ⨯ Failed to generate static paths for /g/[groupId]/r/[reportId]:
 *     Error: Jest worker encountered 2 child process exceptions,
 *     exceeding retry limit  { type: 'WorkerError' }
 *
 * Depois disso a rota devolvia 500 em toda requisição (medido: 10 de 10)
 * enquanto `/dashboard` e as APIs seguiam 200 — o erro que aparecia no
 * navegador e que só reiniciar resolvia.
 *
 * ATENÇÃO ao citar isto como correção: NÃO está provado. A tentativa de
 * reprodução falhou — 15/15 em 200 com a declaração, e também 15/15 SEM ela
 * num servidor recém-subido, inclusive 20/20 sob a carga da suíte completa.
 * O reinício limpo explica sozinho o resultado. O que se sabe é onde o worker
 * morreu, não por quê. Esta linha está certa por mérito próprio; se o erro
 * voltar, a investigação recomeça do zero.
 */
export const dynamic = 'force-dynamic';

export { ReportPage as default } from '@/pages/report';
