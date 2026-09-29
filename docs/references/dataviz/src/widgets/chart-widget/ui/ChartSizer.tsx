'use client';

import { useRef, useState, useEffect } from 'react';

interface ChartSizerProps {
  height: number | string;
  /**
   * Altura a reservar quando o contêiner não tem nenhuma para oferecer.
   *
   * O default serve a gráfico de card; faixa de sparkline precisa de dezenas
   * de pixels, não de trezentos — reservar 300 numa faixa de 34 desenha uma
   * mancha verde do tamanho da página.
   */
  reservedHeight?: number;
  children: (width: number, height: number) => React.ReactNode;
}

/**
 * Substituto do ResponsiveContainer do Recharts.
 *
 * O ResponsiveContainer inicia com estado interno {width:-1, height:-1} e
 * dispara warning antes do ResizeObserver medir o DOM — isso não pode ser
 * suprimido por props. Este componente mede o container primeiro via
 * ResizeObserver e só passa dimensões válidas (>0) para o chart, eliminando
 * o warning na raiz.
 *
 * ─── Por que o gráfico é ABSOLUTO dentro da caixa medida ───
 *
 * O SVG media o próprio pai. Enquanto o card tem altura fixa isso funciona,
 * mas basta a linha do grid passar a ter altura dirigida pelo CONTEÚDO — o
 * que acontece quando qualquer vizinho da mesma linha cresce, já que o grid
 * estica todas as células à altura da maior — para o laço fechar: o SVG vira
 * conteúdo do container, o container cresce pelo padding do card, o
 * ResizeObserver mede de novo, o SVG cresce, e assim por diante. A página
 * crescia cerca de 40px por quadro, indefinidamente, e o sintoma aparecia num
 * gráfico que não tinha nada a ver com a mudança — o vizinho é que mudara.
 *
 * Fora do fluxo, o desenho não pode empurrar o que o mede. A medição continua
 * a mesma; o que some é a realimentação.
 */
/** Altura usada quando o contêiner não tem nenhuma para oferecer. */
const RESERVED_HEIGHT = 300;

export function ChartSizer({ height, reservedHeight = RESERVED_HEIGHT, children }: ChartSizerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [inFlow, setInFlow] = useState(false);
  /** Trava do modo de fluxo: espelha `inFlow` para ser lida dentro do observer. */
  const stayOutOfFlowRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height: h } = entry.contentRect;

      /*
       * ─── Caixa sem altura: cai para o fluxo ───
       *
       * Tirar o desenho do fluxo resolve o laço de realimentação, mas cobra um
       * preço: fora do fluxo ele não dá altura ao pai. No relatório isso não
       * importa (a linha do grid resolve a altura do card), mas no CANVAS de
       * edição o contêiner do bloco é `auto` — e `height: 100%` contra `auto`
       * resolve para ZERO. O gráfico media 0, nunca desenhava, e o card ficava
       * branco no modo de edição enquanto aparecia normal na visualização.
       *
       * Em vez de adivinhar o contexto, o componente MEDE: altura zero com
       * largura real significa "meu pai não tem altura para me dar", e aí o
       * desenho volta ao fluxo com a altura de reserva. É autocorretivo — vale
       * para qualquer contêiner futuro, não só para o canvas.
       */
      if (width > 0 && h <= 0) {
        stayOutOfFlowRef.current = true;
        setInFlow(true);
        setDims((current) => (current && current.w === Math.floor(width) ? current : { w: Math.floor(width), h: reservedHeight }));
        return;
      }

      if (width > 0 && h > 0) {
        /*
         * ⚠️ NÃO volta ao modo fora-de-fluxo.
         *
         * Chegar aqui depois de já estar no fluxo não prova que o pai passou a
         * ter altura — prova que a NOSSA reserva deu altura a ele. Sair do
         * fluxo remove a reserva, o pai volta a zero, e o próximo quadro cai
         * de novo no ramo de cima: o bloco piscava, encolhendo e crescendo
         * indefinidamente. Só acontecia no modo de EDIÇÃO, onde o contêiner do
         * bloco é `auto`; salvo o relatório, a linha do grid dá a altura e o
         * laço nunca começa.
         *
         * Uma vez no fluxo, fica no fluxo: é o estado terminal correto para um
         * pai que não tem altura própria.
         */
        if (stayOutOfFlowRef.current) return;
        setDims((current) => {
          const w = Math.floor(width);
          const heightPx = Math.floor(h);
          // Sem esta guarda, toda medição vira `setState` — e um resize
          // contínuo (arrastar a janela) re-renderiza o gráfico a cada quadro
          // mesmo quando o tamanho não mudou de fato.
          if (current && current.w === w && current.h === heightPx) return current;
          return { w, h: heightPx };
        });
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [reservedHeight]);

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        width: '100%',
        height,
        // Só no modo de fluxo: dá ao pai a altura que ele não soube dar.
        ...(inFlow ? { minHeight: reservedHeight } : {}),
      }}
    >
      <div style={inFlow ? { width: '100%', height: reservedHeight } : { position: 'absolute', inset: 0 }}>
        {dims ? children(dims.w, dims.h) : null}
      </div>
    </div>
  );
}
