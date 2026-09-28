'use client';

import { useMemo } from 'react';
import { Input } from '@/shared/ui/input';
import { ClientBusinessProfile } from '@/shared/schemas/client';

/** Mesmo rótulo do ProductBindingsEditor — mantém a tela coerente. */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

/**
 * Edita o contexto de negócio que a IA usa para responder sobre a carteira
 * deste cliente. Antes isto era um arquivo estático no bundle
 * (`business-context/clients/<id>.json`): onboardar cliente exigia commit e
 * deploy, e o nome das tabelas dele ficava escrito no código.
 *
 * Os campos simples têm controle próprio; os overrides de glossário — array de
 * `{term, definition, sourceTable}` — entram por JSON. É escolha consciente:
 * uma UI de array aninhado aqui custaria mais do que entrega, num formulário
 * que um administrador abre raramente. O JSON é validado pelo mesmo schema que
 * o servidor usa, com o erro mostrado ao lado.
 */
export function BusinessProfileEditor({
  value,
  onChange,
}: {
  value: ClientBusinessProfile;
  onChange: (v: ClientBusinessProfile) => void;
}) {
  const set = <K extends keyof ClientBusinessProfile>(k: K, v: ClientBusinessProfile[K]) =>
    onChange({ ...value, [k]: v });

  const glossaryText = useMemo(
    () => (value.glossaryOverrides.length ? JSON.stringify(value.glossaryOverrides, null, 2) : ''),
    [value.glossaryOverrides],
  );

  const glossaryError = useMemo(() => {
    if (!glossaryText.trim()) return '';
    try {
      const parsed = ClientBusinessProfile.shape.glossaryOverrides.safeParse(
        JSON.parse(glossaryText),
      );
      return parsed.success ? '' : parsed.error.issues[0]?.message ?? 'Formato inválido';
    } catch {
      return 'JSON inválido';
    }
  }, [glossaryText]);

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h4 className="text-sm font-medium text-foreground">Contexto de negócio para a IA</h4>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Opcional. Sem isto o assistente responde sem conhecer as
          particularidades da carteira — não deixa de funcionar.
        </p>
      </div>

      <div>
        <Label>Produto dominante</Label>
        <Input
          value={value.dominantProduct ?? ''}
          onChange={(e) => set('dominantProduct', e.target.value || undefined)}
          placeholder="Uma frase sobre o crédito predominante da carteira"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label>Coluna de data-base</Label>
          <Input
            value={value.partitionKey ?? ''}
            onChange={(e) => set('partitionKey', e.target.value || undefined)}
            placeholder="data_base_report"
            className="font-mono text-xs"
          />
        </div>
        <div>
          <Label>Granularidade</Label>
          <select
            value={value.granularity ?? ''}
            onChange={(e) =>
              set('granularity', (e.target.value || undefined) as ClientBusinessProfile['granularity'])
            }
            className="h-9 w-full rounded-lg border border-border bg-muted/40 px-3 text-sm text-foreground"
          >
            <option value="">—</option>
            <option value="contrato">contrato</option>
            <option value="safra">safra</option>
            <option value="carteira">carteira</option>
          </select>
        </div>
      </div>

      <div>
        <Label>Tabelas preferidas</Label>
        <Input
          value={value.tablesPreferred.join(', ')}
          onChange={(e) =>
            set(
              'tablesPreferred',
              e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
            )
          }
          placeholder="dataset.tabela, dataset.outra_tabela"
          className="font-mono text-xs"
        />
        <p className="mt-1 text-[10px] text-muted-foreground/70">
          Dica de prompt, não fonte de verdade — quem resolve dataset e coluna é
          o vínculo de produto acima.
        </p>
      </div>

      <div>
        <Label>Restrições de compliance</Label>
        <Input
          value={value.complianceConstraints.join(', ')}
          onChange={(e) =>
            set(
              'complianceConstraints',
              e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
            )
          }
          placeholder="Lei 13786, CVM 60"
        />
      </div>

      <div>
        <Label>Termos com significado próprio deste cliente (JSON)</Label>
        <textarea
          value={glossaryText}
          onChange={(e) => {
            try {
              const parsed = ClientBusinessProfile.shape.glossaryOverrides.safeParse(
                JSON.parse(e.target.value || '[]'),
              );
              if (parsed.success) set('glossaryOverrides', parsed.data);
            } catch {
              /* mantém o valor anterior enquanto o JSON está incompleto */
            }
          }}
          rows={6}
          placeholder={'[\n  { "term": "...", "definition": "...", "sourceTable": "..." }\n]'}
          className="w-full rounded-lg border border-border bg-muted/40 p-2 font-mono text-[11px] text-foreground"
        />
        {glossaryError && <p className="mt-1 text-[11px] text-red-400">{glossaryError}</p>}
      </div>
    </div>
  );
}

/** Perfil vazio — usado quando o cliente ainda não tem um. */
export const EMPTY_PROFILE: ClientBusinessProfile = {
  tablesPreferred: [],
  glossaryOverrides: [],
  complianceConstraints: [],
};
