/**
 * Runs `build` inside a promise: a throw becomes a rejection, as with an async
 * function, without an `async` body that never awaits.
 */
export const deferred = <T>(build: () => T): Promise<T> =>
  new Promise<T>((resolve) => {
    resolve(build());
  });
