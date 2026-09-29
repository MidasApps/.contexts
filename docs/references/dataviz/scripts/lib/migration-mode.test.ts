import { describe, it, expect } from 'vitest';
import { willWrite } from './migration-mode';

/**
 * Estes scripts escrevem no Firestore de produção-dev. O modo de execução é a
 * única coisa entre um relatório e uma gravação, então ele não pode depender de
 * qual flag veio primeiro.
 */
describe('willWrite', () => {
  it('grava só com --apply', () => {
    expect(willWrite(['node', 'x.ts', '--apply'])).toBe(true);
  });

  it('sem flag nenhuma é leitura', () => {
    expect(willWrite(['node', 'x.ts'])).toBe(false);
    expect(willWrite(['node', 'x.ts', '--dry-run'])).toBe(false);
  });

  /*
   * Quem conferiu o dry-run e emendou o apply na mesma linha não pediu para
   * gravar — pediu as duas coisas. O modo que escreve tem de ser pedido
   * sozinho, senão o operador lê "APPLY" onde esperava "DRY-RUN".
   */
  it('--dry-run vence --apply, em qualquer ordem', () => {
    expect(willWrite(['node', 'x.ts', '--dry-run', '--apply'])).toBe(false);
    expect(willWrite(['node', 'x.ts', '--apply', '--dry-run'])).toBe(false);
  });
});
