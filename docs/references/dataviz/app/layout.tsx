import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Geist, Geist_Mono } from 'next/font/google';
import { Providers } from '@/app/providers/Providers';
import './globals.css';

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'DataViz',
  description: 'Dashboard de dados conectado ao BigQuery',
};

/**
 * Renderização por requisição — exigência do CSP com nonce (`proxy.ts`).
 *
 * O nonce que autoriza cada `<script>` nasce da requisição. Página gerada no
 * build não tem requisição, então sai com script sem nonce — e o próprio CSP
 * bloqueia o framework: tela branca. Medido antes de escrever isto: `/login`
 * pré-renderizada emitia 26 scripts, 7 deles inline, nenhum com nonce.
 *
 * O custo é baixo aqui porque não havia HTML estático de valor a perder: toda
 * página do produto está atrás de login e busca seus dados no cliente. O que o
 * prerender economizava era o shell, não o conteúdo.
 */
export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Posto pelo proxy na requisição. O Next carimba sozinho os scripts que
  // ele mesmo injeta; o do `next-themes` é da aplicação e precisa do repasse.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
