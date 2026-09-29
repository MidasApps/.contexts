import '@testing-library/jest-dom/vitest';

// happy-dom não computa layout real: o ResizeObserver nativo nunca reporta
// dimensões > 0, o que trava componentes como ChartSizer (só renderiza os
// filhos após observar width/height positivos). Stub síncrono p/ testes.
class ResizeObserverStub {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.callback([{ contentRect: { width: 800, height: 340 } } as any], this as unknown as ResizeObserver);
  }

  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
