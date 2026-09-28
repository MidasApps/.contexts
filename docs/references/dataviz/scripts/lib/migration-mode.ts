/**
 * Uma migração GRAVA? A resposta, lida dos argumentos de linha de comando.
 *
 * Ler é o default; escrever precisa ser pedido — e pedido SOZINHO. Com
 * `--apply` bastando, `--dry-run --apply` grava: é a linha que sai de quem
 * conferiu o relatório e emendou o apply no fim do comando anterior, e o
 * cabeçalho ainda anuncia o modo que o operador esperava ver. Estes scripts
 * escrevem no Firestore de produção-dev; a flag mais conservadora vence.
 */
export function willWrite(argv: readonly string[]): boolean {
  return argv.includes('--apply') && !argv.includes('--dry-run');
}
