import { describe, it, expect, afterEach } from 'vitest';
import { maxBytesBilled, isBytesBilledError, approvalBytesThreshold } from '../cost-guard';

afterEach(() => {
  delete process.env.BQ_MAX_BYTES_BILLED;
  delete process.env.BQML_APPROVAL_BYTES_THRESHOLD;
});

/**
 * Este guard existe porque o SQL que chega ao BigQuery pode ter sido escrito
 * por um LLM: o filtro de palavra-chave do execute_sql impede DML/DDL, não
 * impede varrer a tabela inteira. Antes disto, `maximumBytesBilled` não
 * aparecia em lugar nenhum do repositório.
 */
describe('maxBytesBilled', () => {
  it('default de 5 GiB espelha o limiar de aprovação já praticado no produto', () => {
    expect(maxBytesBilled()).toBe(5 * 1024 ** 3);
  });

  it('respeita BQ_MAX_BYTES_BILLED quando é número positivo', () => {
    process.env.BQ_MAX_BYTES_BILLED = '1073741824';
    expect(maxBytesBilled()).toBe(1_073_741_824);
  });

  // Fail-safe: env inválida NÃO pode virar "sem teto".
  it.each(['0', '-1', 'abc', ''])('ignora env inválida (%s) e mantém o default', (v) => {
    process.env.BQ_MAX_BYTES_BILLED = v;
    expect(maxBytesBilled()).toBe(5 * 1024 ** 3);
  });
});

describe('isBytesBilledError', () => {
  it('reconhece a rejeição do BigQuery por teto excedido', () => {
    expect(isBytesBilledError(new Error('bytesBilledLimitExceeded: query exceeds limit'))).toBe(true);
    expect(isBytesBilledError(new Error('Query exceeded maximum bytes billed'))).toBe(true);
  });

  it('reconhece a mensagem que o BigQuery devolve de fato (sem o reason no texto)', () => {
    expect(isBytesBilledError(new Error('Query exceeded limit for bytes billed: 5368709120. 10485760 or higher required.'))).toBe(true);
  });

  it('não confunde com outros erros — senão o modelo receberia a dica errada', () => {
    expect(isBytesBilledError(new Error('Syntax error near SELECT'))).toBe(false);
    expect(isBytesBilledError(null)).toBe(false);
    expect(isBytesBilledError(undefined)).toBe(false);
  });
});

/**
 * Aprovação e teto coexistem (rules/cost.md), mas só fazem sentido juntos se a
 * aprovação cair ABAIXO do teto: com os dois em 5 GiB, o job grande o bastante
 * para pedir aprovação era recusado pelo teto depois de aprovado.
 */
describe('approvalBytesThreshold', () => {
  it('defaults to half the byte cap, so an approved job can still run', () => {
    expect(approvalBytesThreshold()).toBe(maxBytesBilled() / 2);
  });

  it('follows the cap when BQ_MAX_BYTES_BILLED changes', () => {
    process.env.BQ_MAX_BYTES_BILLED = String(20 * 1024 ** 3);

    expect(approvalBytesThreshold()).toBe(10 * 1024 ** 3);
  });

  it('accepts a configured threshold below the cap', () => {
    process.env.BQML_APPROVAL_BYTES_THRESHOLD = String(1024 ** 3);

    expect(approvalBytesThreshold()).toBe(1024 ** 3);
  });

  it.each([String(5 * 1024 ** 3), String(50 * 1024 ** 3), '0', '-1', 'abc', ''])(
    'falls back to the default when the configured value (%s) is not below the cap or invalid',
    (v) => {
      process.env.BQML_APPROVAL_BYTES_THRESHOLD = v;

      expect(approvalBytesThreshold()).toBe(maxBytesBilled() / 2);
    },
  );
});
