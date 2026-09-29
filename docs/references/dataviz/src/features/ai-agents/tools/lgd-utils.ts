/**
 * Unified LGD (Loss Given Default) SQL expressions.
 *
 * LGD = 1 - recovery_ratio, where recovery_ratio = valor_imovel / saldo_devedor.
 * Capped at [0, 1] range. Falls back to 0.45 when valor_imovel is NULL/0.
 *
 * Single source of truth for LGD computation across all tools.
 */

/** SQL expression for per-contract LGD (use in SELECT). */
export const LGD_EXPR = `LEAST(GREATEST(1 - SAFE_DIVIDE(valor_imovel, saldo_devedor), 0), 1)`;

/** SQL expression for per-contract LGD with NULL fallback. */
export const LGD_COALESCE_EXPR = `COALESCE(${LGD_EXPR}, 0.45)`;

// LGD_AVG_EXPR (AVG sobre LGD_COALESCE_EXPR) removido — nenhuma query o
// montava; as agregações escrevem o AVG na própria recipe.
