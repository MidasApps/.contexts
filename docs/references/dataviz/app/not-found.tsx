import Link from 'next/link';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="space-y-2">
          <p className="font-display text-[8rem] font-extrabold leading-none tracking-tighter text-primary">
            404
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Página não encontrada
          </h1>
          <p className="text-sm text-foreground/50 leading-relaxed">
            A página que você está procurando não existe ou foi movida para outro
            endereço.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card/60 p-6 space-y-1 text-left">
          <p className="text-xs font-medium text-foreground/30 uppercase tracking-widest">
            O que pode ter acontecido
          </p>
          <ul className="mt-3 space-y-2 text-sm text-foreground/50">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
              O endereço foi digitado incorretamente
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
              O link que você seguiu está desatualizado
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
              Você não tem permissão para acessar esta página
            </li>
          </ul>
        </div>

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          <Home className="h-4 w-4" strokeWidth={2} />
          Voltar ao Dashboard
        </Link>
      </div>
    </div>
  );
}
