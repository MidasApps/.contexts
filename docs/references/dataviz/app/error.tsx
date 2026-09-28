'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Em produção o usuário vê apenas o `digest` — o identificador que o Next gera
 * e que também vai para o log do servidor, então é por ele que se acha o erro.
 *
 * `error.message` NÃO é seguro exibir: o Next só substitui a mensagem por um
 * texto genérico em erro de Server Component. Erro lançado no cliente chega aqui
 * com a mensagem original da lib que falhou — que costuma carregar URL interna,
 * nome de campo, trecho de payload. É o que a rule `error-handling` proíbe
 * ("mensagem ao cliente é genérica; stack trace só no log").
 */
const isDev = process.env.NODE_ENV !== 'production';

export default function GlobalError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  const detail = isDev ? error.message : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10">
          <AlertTriangle className="h-9 w-9 text-red-400" strokeWidth={1.5} />
        </div>

        <div className="space-y-3">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Algo deu errado
          </h1>
          <p className="text-sm text-foreground/50 leading-relaxed">
            Ocorreu um erro inesperado na aplicação. Você pode tentar novamente
            ou voltar ao dashboard.
          </p>
        </div>

        {(detail || error.digest) && (
          <div className="rounded-2xl border border-border bg-card/60 p-4 text-left">
            <p className="text-xs font-medium text-foreground/30 uppercase tracking-widest mb-2">
              {detail ? 'Detalhes do erro' : 'Código de referência'}
            </p>
            {detail && (
              <p className="font-mono text-xs text-foreground/40 break-all leading-relaxed">
                {detail}
              </p>
            )}
            {error.digest && (
              <p className={`font-mono text-xs text-foreground/20 ${detail ? 'mt-2' : ''}`}>
                digest: {error.digest}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={2} />
            Tentar novamente
          </button>

          <Link
            href="/dashboard"
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-border bg-foreground/[0.04] px-6 py-3 text-sm font-semibold text-foreground/70 transition-colors duration-150 hover:bg-foreground/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <Home className="h-4 w-4" strokeWidth={2} />
            Voltar ao Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
