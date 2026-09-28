'use client';

import { cn } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';
import type { CanvasBlock } from '@/shared/config/agents/types';
import { widthContextOf, widthOf, blockSpec } from '@/features/report-authoring/schema/block-specs';

interface BlockInspectorProps {
  block: CanvasBlock;
  onChange: (updates: Partial<CanvasBlock>) => void;
  /**
   * Permite editar os campos que amarram o bloco à métrica: `metricId`,
   * `xAxisKey`, `dataKeys` e o `accessorKey` das colunas.
   *
   * Verdadeiro no editor de templates, onde a amarração é justamente o que se
   * está autorando. **Falso no relatório**: lá `useReportData` renomeia as
   * colunas devolvidas pela métrica (`bucket`/`value`) para o `xAxisKey` e o
   * `dataKeys[0]` do bloco. Editá-los à mão só funciona enquanto casarem com o
   * que a métrica devolve — quando não casam, a série some sem dizer por quê.
   *
   * Campos amarrados continuam VISÍVEIS, só desabilitados: ver a amarração
   * ajuda a diagnosticar; poder quebrá-la sem aviso, não.
   */
  bindingEditable?: boolean;
}

const selectCls = 'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground';
const FORMATS = ['', 'number', 'currency', 'percent'] as const;

/**
 * Tipos de gráfico oferecidos.
 *
 * Listava CINCO de sete: `waterfall` renderizava, a IA sabia criá-lo e o
 * inspetor não o oferecia — um waterfall criado pelo assistente aparecia no
 * select com um valor fora das opções, e não havia como voltar a ele pela mão.
 * A lista sai do tipo, não de memória.
 */
const CHART_TYPES = [
  'bar', 'line', 'area', 'composed', 'stacked-bar', 'waterfall', 'histogram',
] as const satisfies readonly Extract<CanvasBlock, { type: 'chart' }>['chartType'][];

/**
 * Um campo do inspetor.
 *
 * `fullWidth` ocupa as duas colunas da grade — para o que não cabe em meia
 * largura: área de texto, editor de colunas da tabela, lista longa.
 */
function Field({
  label,
  children,
  hint,
  fullWidth,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  fullWidth?: boolean;
}) {
  return (
    <label className={cn('block space-y-1', fullWidth && 'sm:col-span-2')}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground/60">{hint}</span>}
    </label>
  );
}

export function BlockInspector({ block, onChange, bindingEditable = true }: BlockInspectorProps) {
  // Só há amarração a proteger quando o bloco tem métrica: bloco solto (criado
  // pela IA, sem `metricId`) carrega os próprios dados e é livre para editar.
  const isLocked = !bindingEditable && Boolean(block.metricId);
  const bindingHint = isLocked
    ? 'Definido pela métrica deste bloco — edite no template.'
    : undefined;

  /** Campo de métrica — igual em todo tipo que consome uma. */
  const metricField = (
    <Field label="Metric ID" hint={bindingHint}>
      <Input aria-label="Metric ID" value={block.metricId ?? ''} disabled={isLocked}
        onChange={(e) => onChange({ metricId: e.target.value || undefined })} />
    </Field>
  );

  const formatField = (value: string | undefined) => (
    <Field label="Formato">
      <select aria-label="Formato" className={selectCls} value={value ?? ''}
        onChange={(e) => onChange({ format: (e.target.value || undefined) as never })}>
        {FORMATS.map((f) => <option key={f || 'none'} value={f}>{f || '—'}</option>)}
      </select>
    </Field>
  );

  const titleField = (value: string | undefined) => (
    <Field label="Título">
      <Input aria-label="Título" value={value ?? ''}
        onChange={(e) => onChange({ title: e.target.value } as Partial<CanvasBlock>)} />
    </Field>
  );

  /*
   * A largura oferecida é a FAIXA DO CONTRATO, não 1..6.
   *
   * O select listava as seis sempre, então a mão podia pôr um gráfico em 1/6 —
   * largura que a tool da IA recusa, com uma razão medida ("a 1/6 sobram 33px
   * de área de plotagem"). Duas portas para o mesmo canvas com réguas
   * diferentes é o defeito que `block-specs.ts` existe para não ter.
   */
  const contract = widthOf(block.type, widthContextOf(block));
  /*
   * Mesma regra da régua do canvas: bloco gravado abaixo do mínimo (um medidor
   * que virou arco com 2/6) mantém a largura atual como piso. Sem ela entre as
   * opções, o select exibia a primeira ("3/6") para um bloco desenhado em 2/6.
   */
  const range = block.colSpan === undefined
    ? contract
    : { ...contract, min: Math.min(contract.min, block.colSpan) };
  const validWidths = Array.from(
    { length: range.max - range.min + 1 },
    (_, i) => range.min + i,
  );

  return (
    /*
     * Duas colunas a partir de `sm`.
     *
     * Este é o formulário mais longo do app: um bloco de gráfico chega a
     * quinze campos, e empilhados eles passavam da tela dentro de um diálogo
     * que não rolava. A grade é plana e os campos entram por
     * auto-posicionamento — os fragmentos por tipo de bloco não criam caixa,
     * então cada `Field` continua sendo filho direto da grade.
     *
     * O que não cabe em meia largura pede `fullWidth`: área de texto e o editor
     * de colunas da tabela.
     */
    <div className="grid gap-3 sm:grid-cols-2">
      {block.type === 'kpi' && (
        <>
          <Field label="Label">
            <Input aria-label="Label" value={block.label}
              onChange={(e) => onChange({ label: e.target.value })} />
          </Field>
          {metricField}
          {formatField(block.format)}
        </>
      )}

      {block.type === 'gauge' && (
        <>
          <Field label="Label">
            <Input aria-label="Label" value={block.label}
              onChange={(e) => onChange({ label: e.target.value })} />
          </Field>
          {metricField}
          <Field label="Desenho" hint="Faixa cabe em 2 colunas; arco exige 3 e destaca mais.">
            <select aria-label="Desenho" className={selectCls} value={block.display ?? 'meter'}
              onChange={(e) => onChange({ display: e.target.value as never })}>
              <option value="meter">faixa horizontal</option>
              <option value="arc">arco</option>
            </select>
          </Field>
          <Field label="Limite (threshold)" hint="O mínimo contratado. Marca o traço no medidor.">
            <Input aria-label="Limite (threshold)" type="number" value={block.threshold}
              onChange={(e) => onChange({ threshold: Number(e.target.value) })} />
          </Field>
          <Field label="Faixa de atenção (warnThreshold)" hint="Entre o limite e este valor, o arco pinta âmbar.">
            <Input aria-label="Faixa de atenção (warnThreshold)" type="number" value={block.warnThreshold ?? ''}
              onChange={(e) => onChange({ warnThreshold: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </Field>
          <Field label="Sufixo">
            <Input aria-label="Sufixo" value={block.suffix ?? ''}
              onChange={(e) => onChange({ suffix: e.target.value || undefined })} />
          </Field>
          {formatField(block.format)}
          <Field label="Escala invertida" hint="Marque quando quanto MAIOR pior (concentração, inadimplência).">
            <input aria-label="Escala invertida" type="checkbox" className="size-4 accent-primary"
              checked={block.reverseScale ?? false}
              onChange={(e) => onChange({ reverseScale: e.target.checked })} />
          </Field>
        </>
      )}

      {block.type === 'progress' && (
        <>
          <Field label="Label">
            <Input aria-label="Label" value={block.label}
              onChange={(e) => onChange({ label: e.target.value })} />
          </Field>
          {metricField}
          <Field label="Meta (target)" hint="Configuração do bloco — não vem da métrica.">
            <Input aria-label="Meta (target)" type="number" value={block.target}
              onChange={(e) => onChange({ target: Number(e.target.value) })} />
          </Field>
          <Field label="Rótulo da meta">
            <Input aria-label="Rótulo da meta" placeholder="previstos" value={block.targetLabel ?? ''}
              onChange={(e) => onChange({ targetLabel: e.target.value || undefined })} />
          </Field>
          {formatField(block.format)}
        </>
      )}

      {block.type === 'comparison' && (
        <>
          <Field label="Label">
            <Input aria-label="Label" value={block.label}
              onChange={(e) => onChange({ label: e.target.value })} />
          </Field>
          {metricField}
          {formatField(block.format)}
          <Field label="Diferença em p.p." hint="Marque quando a métrica já é percentual.">
            <input aria-label="Diferença em p.p." type="checkbox" className="size-4 accent-primary"
              checked={block.deltaAsPoints ?? false}
              onChange={(e) => onChange({ deltaAsPoints: e.target.checked })} />
          </Field>
          <Field label="Subir é bom">
            <input aria-label="Subir é bom" type="checkbox" className="size-4 accent-primary"
              checked={block.positiveIsGood ?? true}
              onChange={(e) => onChange({ positiveIsGood: e.target.checked })} />
          </Field>
        </>
      )}

      {block.type === 'chart' && (
        <>
          {titleField(block.title)}
          <Field label="Tipo de gráfico">
            <select aria-label="Tipo de gráfico" className={selectCls} value={block.chartType}
              onChange={(e) => onChange({ chartType: e.target.value as never })}>
              {CHART_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Eixo X (xAxisKey)" hint={bindingHint}>
            <Input aria-label="Eixo X (xAxisKey)" value={block.xAxisKey} disabled={isLocked}
              onChange={(e) => onChange({ xAxisKey: e.target.value })} />
          </Field>
          <Field label="Data keys (vírgula)" hint={bindingHint}>
            <Input aria-label="Data keys (vírgula)" value={block.dataKeys.join(', ')} disabled={isLocked}
              onChange={(e) => onChange({ dataKeys: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          </Field>
          <Field
            label="Séries no eixo direito (vírgula)"
            hint="Subconjunto das data keys. Use quando as unidades diferem (R$ com %)."
          >
            <Input aria-label="Séries no eixo direito (vírgula)" value={(block.rightAxisKeys ?? []).join(', ')}
              onChange={(e) => {
                const keys = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                onChange({ rightAxisKeys: keys.length ? keys : undefined });
              }} />
          </Field>
          {metricField}
        </>
      )}

      {block.type === 'donut' && (
        <>
          {titleField(block.title)}
          {metricField}
          <Field label="Desenho">
            <select aria-label="Desenho" className={selectCls} value={block.display ?? 'donut'}
              onChange={(e) => onChange({ display: e.target.value as never })}>
              <option value="donut">rosca</option>
              <option value="bar">barra 100%</option>
            </select>
          </Field>
          <Field label="Rótulo do centro">
            <Input aria-label="Rótulo do centro" placeholder="Total" value={block.centerLabel ?? ''}
              onChange={(e) => onChange({ centerLabel: e.target.value || undefined })} />
          </Field>
          {formatField(block.format)}
        </>
      )}

      {block.type === 'targets' && (
        <>
          {titleField(block.title)}
          {metricField}
          <Field label="Desenho" hint="bullet mostra a distância até a meta; lista cabe mais itens.">
            <select aria-label="Desenho" className={selectCls} value={block.display ?? 'bullet'}
              onChange={(e) => onChange({ display: e.target.value as never })}>
              <option value="bullet">bullet</option>
              <option value="list">lista</option>
            </select>
          </Field>
          <Field label="Sufixo">
            <Input aria-label="Sufixo" value={block.suffix ?? ''}
              onChange={(e) => onChange({ suffix: e.target.value || undefined })} />
          </Field>
          {formatField(block.format)}
        </>
      )}

      {block.type === 'sparkrows' && (
        <>
          {titleField(block.title)}
          {metricField}
          {formatField(block.format)}
          <Field label="Subir é bom">
            <input aria-label="Subir é bom" type="checkbox" className="size-4 accent-primary"
              checked={block.positiveIsGood ?? true}
              onChange={(e) => onChange({ positiveIsGood: e.target.checked })} />
          </Field>
        </>
      )}

      {block.type === 'scatter' && (
        <>
          {titleField(block.title)}
          {metricField}
          <Field label="Rótulo do eixo X">
            <Input aria-label="Rótulo do eixo X" value={block.xLabel ?? ''}
              onChange={(e) => onChange({ xLabel: e.target.value || undefined })} />
          </Field>
          <Field label="Rótulo do eixo Y">
            <Input aria-label="Rótulo do eixo Y" value={block.yLabel ?? ''}
              onChange={(e) => onChange({ yLabel: e.target.value || undefined })} />
          </Field>
          <Field label="Corte no eixo X" hint="Linha vertical de referência (ex: LTV de 80%).">
            <Input aria-label="Corte no eixo X" type="number" value={block.xReference?.value ?? ''}
              onChange={(e) => onChange({
                xReference: e.target.value === ''
                  ? undefined
                  : { value: Number(e.target.value), ...(block.xReference?.label ? { label: block.xReference.label } : {}) },
              })} />
          </Field>
        </>
      )}

      {block.type === 'heatmap' && (
        <>
          {titleField(block.title)}
          {metricField}
          <Field label="Rótulo das linhas">
            <Input aria-label="Rótulo das linhas" placeholder="Safra" value={block.rowLabel ?? ''}
              onChange={(e) => onChange({ rowLabel: e.target.value || undefined })} />
          </Field>
          <Field label="Rótulo das colunas">
            <Input aria-label="Rótulo das colunas" placeholder="Meses" value={block.colLabel ?? ''}
              onChange={(e) => onChange({ colLabel: e.target.value || undefined })} />
          </Field>
          {formatField(block.format)}
          <Field label="Valor alto é ruim" hint="Desmarque para métrica em que alto é bom (pinta verde).">
            <input aria-label="Valor alto é ruim" type="checkbox" className="size-4 accent-primary"
              checked={block.highIsBad ?? true}
              onChange={(e) => onChange({ highIsBad: e.target.checked })} />
          </Field>
        </>
      )}

      {(block.type === 'funnel' || block.type === 'boxplot') && (
        <>
          {titleField(block.title)}
          {metricField}
          {formatField(block.format)}
        </>
      )}

      {block.type === 'treemap' && (
        <>
          {titleField(block.title)}
          {metricField}
          {formatField(block.format)}
        </>
      )}

      {block.type === 'sankey' && (
        <>
          {titleField(block.title)}
          {metricField}
          {formatField(block.format)}
          {/* Sem esta ordem o bloco não sabe o que é piora: as fitas saem todas
              cinzas, e a leitura que justifica o bloco desaparece. */}
          <Field label="Ordem de gravidade" fullWidth hint="Os estados do melhor ao pior, separados por vírgula. É o que decide a cor de cada migração.">
            <Input aria-label="Ordem de gravidade" placeholder="Sem atraso, 1-30, 31-60"
              value={block.ordem?.join(', ') ?? ''}
              onChange={(e) => {
                const items = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                onChange({ ordem: items.length > 0 ? items : undefined });
              }} />
          </Field>
        </>
      )}

      {block.type === 'table' && (
        <>
          {titleField(block.title)}
          {metricField}
          <div className="space-y-1 sm:col-span-2">
            <span className="text-xs text-muted-foreground">Colunas</span>
            {block.columns.map((c, i) => (
              <div key={i} className="flex gap-2">
                {/* O rótulo é livre mesmo com métrica: é texto de tela. O
                    `accessorKey` é o nome do campo no dado — esse, não. */}
                <Input aria-label={`Coluna ${i} header`} placeholder="Header" value={c.header}
                  onChange={(e) => {
                    const columns = block.columns.map((col, j) => j === i ? { ...col, header: e.target.value } : col);
                    onChange({ columns });
                  }} />
                <Input aria-label={`Coluna ${i} accessorKey`} placeholder="accessorKey" value={c.accessorKey} disabled={isLocked}
                  onChange={(e) => {
                    const columns = block.columns.map((col, j) => j === i ? { ...col, accessorKey: e.target.value } : col);
                    onChange({ columns });
                  }} />
                {!isLocked && (
                  <button type="button" aria-label={`Remover coluna ${i}`} className="text-muted-foreground/60 hover:text-destructive px-2"
                    onClick={() => onChange({ columns: block.columns.filter((_, j) => j !== i) })}>×</button>
                )}
              </div>
            ))}
            {!isLocked && (
              <button type="button" className="text-xs text-primary hover:underline"
                onClick={() => onChange({ columns: [...block.columns, { header: 'Coluna', accessorKey: 'coluna' }] })}>
                + Adicionar coluna
              </button>
            )}
          </div>
        </>
      )}

      {block.type === 'text' && (
        <Field label="Conteúdo (markdown)" fullWidth>
          <textarea aria-label="Conteúdo (markdown)" className={`${selectCls} h-28 py-2`} value={block.content}
            onChange={(e) => onChange({ content: e.target.value })} />
        </Field>
      )}

      {/* Comum a todos os tipos editáveis */}
      <Field label="Largura (colSpan)" hint={blockSpec(block.type).widthRationale}>
        <select aria-label="Largura (colSpan)" className={selectCls} value={block.colSpan ?? range.recommended}
          onChange={(e) => onChange({ colSpan: Number(e.target.value) as never })}>
          {validWidths.map((n) => (
            <option key={n} value={n}>
              {n}/6{n === range.recommended ? ' (recomendado)' : ''}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
