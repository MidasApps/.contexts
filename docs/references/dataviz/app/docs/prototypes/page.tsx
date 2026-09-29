import { PrototypesPage } from '@/pages/prototypes/ui/PrototypesPage';

/**
 * `/docs/prototypes` — a galeria de componentes.
 *
 * Fica sob `app/docs/`, cujo layout é passa-adiante: herda o `Providers` do
 * layout raiz (`AuthProvider` + `DataProvider`), que é o que o `useReportData`
 * precisa para buscar métrica de verdade. Não herda o `DashboardLayout` — sem
 * barra lateral, então a página impõe a largura útil do relatório por conta
 * própria, senão a proporção apareceria mais folgada do que é.
 */
export const metadata = {
  title: 'Galeria de componentes — dataviz',
};

export default function Page() {
  return <PrototypesPage />;
}
