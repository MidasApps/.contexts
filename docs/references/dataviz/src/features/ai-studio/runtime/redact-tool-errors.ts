import { formatToolError } from '@/features/ai-agents/lib/format-error';

/**
 * Todo erro que uma tool LANÇA sai redigido por `formatToolError`.
 *
 * O Mastra devolve ao modelo a mensagem de um erro lançado pela tool
 * (`Error executing tool …: <mensagem>`). Cada tool que esquecia o try/catch —
 * `bqml_list_models`, os awaits do `bqml_create_or_use_model` — mandava a
 * mensagem crua do BigQuery, com id de projeto e e-mail de service account. Em
 * vez de caçar tool a tool, a redação fica no ponto por onde TODA tool dos
 * agentes passa (`buildToolsFromKeys`). O retorno normal não muda.
 *
 * Vale para `execute` que devolve Promise e para o gerador assíncrono (tool
 * com streaming de progresso): o Mastra decide pelo valor devolvido
 * (`isAsyncIterable`), então o gerador embrulhado continua sendo gerador.
 */
const toRedactedError = (err: unknown): Error => new Error(formatToolError(err));

type Execute = (...args: unknown[]) => unknown;

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
  value !== null
  && value !== undefined
  && typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function';

const isThenable = (value: unknown): boolean =>
  typeof (value as { then?: unknown } | null | undefined)?.then === 'function';

const redactAsyncIterable = async function* (source: AsyncIterable<unknown>): AsyncGenerator<unknown> {
  try {
    yield* source;
  } catch (err) {
    throw toRedactedError(err);
  }
};

const redactPromise = async (value: unknown): Promise<unknown> => {
  try {
    return await value;
  } catch (err) {
    throw toRedactedError(err);
  }
};

const wrapExecute = (execute: Execute): Execute =>
  // `function` expression, not an arrow: the tool framework may call execute
  // with a `this`, and it has to reach the original.
  function redactedExecute(this: unknown, ...args: unknown[]) {
    let result: unknown;
    try {
      result = execute.apply(this, args);
    } catch (err) {
      throw toRedactedError(err);
    }
    if (isAsyncIterable(result) && !isThenable(result)) return redactAsyncIterable(result);
    return redactPromise(result);
  };

export const withRedactedErrors = <T>(tool: T): T => {
  const execute = (tool as { execute?: unknown }).execute;
  if (typeof execute !== 'function') return tool;
  const copy = Object.create(Object.getPrototypeOf(tool) as object) as T;
  Object.assign(copy as object, tool, { execute: wrapExecute(execute as Execute) });
  return copy;
};
