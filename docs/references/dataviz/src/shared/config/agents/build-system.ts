import type { BusinessContext } from '@/shared/config/business-context';
import type { MacroSnapshot } from '@/shared/lib/macro/bcb-sgs';
import { getGlossaryEntry, GLOSSARY_VERSION } from '@/shared/config/glossary';
import type {
  PersonaProfile,
  IcpProfile,
} from '@/shared/config/business-context/schemas';
import type { ClientBusinessProfile } from '@/shared/schemas/client';
import type {
  BusinessContext as RetrievedBusinessContext,
  DashboardTemplate,
  RetrievedChunk,
} from '@/features/business-context/types';

export interface BuildAgentSystemArgs {
  /** Id do cliente. Vem separado porque o perfil pode ser `null`. */
  clientId: string;
  context: BusinessContext;
  macro: MacroSnapshot;
  baseInstructions: string;
  /**
   * Sprint 2.D: optional dynamic context produced by retrieveBusinessContext.
   * When present, `## Template do dashboard` and `## Contexto recuperado`
   * sections are rendered. Drops retrieved chunks first under token pressure.
   */
  retrievedContext?: RetrievedBusinessContext;
}

const TOK = (s: string): number => Math.ceil(s.length / 4);

/**
 * Bloco de cliente do prompt. Todo campo é opcional porque o perfil é cadastro
 * de administração: cliente recém-criado tem perfil vazio, e isso não pode
 * virar prompt com "undefined" nem exceção.
 */
function renderClient(clientId: string, c: ClientBusinessProfile | null): string {
  const lines = [`## Cliente: ${clientId}`];
  if (!c) return lines.join('\n');

  if (c.dominantProduct) lines.push(`- Produto dominante: ${c.dominantProduct}`);
  if (c.avgLtv != null) lines.push(`- LTV médio: ${c.avgLtv}`);
  if (c.wal != null) lines.push(`- WAL: ${c.wal}`);
  if (c.ocTarget != null) lines.push(`- OC target: ${c.ocTarget}`);
  if (c.tablesPreferred.length) {
    lines.push(`- Tabelas preferidas: ${c.tablesPreferred.join(', ')}`);
  }
  if (c.granularity) lines.push(`- Granularidade: ${c.granularity}`);
  if (c.complianceConstraints.length) {
    lines.push(`- Compliance: ${c.complianceConstraints.join(', ')}`);
  }
  if (c.glossaryOverrides.length) {
    lines.push(`- Overrides de glossário (${c.glossaryOverrides.length}):`);
    for (const o of c.glossaryOverrides.slice(0, 5)) {
      lines.push(`  - ${o.term}: ${o.definition}`);
    }
  }
  return lines.join('\n');
}

function renderPersona(p: PersonaProfile): string {
  const lines = [
    `## Persona: ${p.name} (${p.id})`,
    `- Camada: ${p.layer} | Linguagem: ${p.language} | Horizonte: ${p.horizon}`,
    `- KPIs prioritários: ${p.priorityKpis.join(', ')}`,
    `- Granularidade preferida: ${p.preferredGranularity}`,
  ];
  if (p.preferredVisuals.length) lines.push(`- Visuais: ${p.preferredVisuals.join(', ')}`);
  if (p.jargonAnchor.length) lines.push(`- Jargão âncora: ${p.jargonAnchor.join(', ')}`);
  if (p.forbidden.length) lines.push(`- A evitar: ${p.forbidden.join(', ')}`);
  return lines.join('\n');
}

function renderIcpFull(icp: IcpProfile): string {
  const lines = [
    `## ICP: ${icp.id}`,
    `- Segmento: ${icp.segment}`,
    `- Jornada de decisão: ${icp.decisionJourney}`,
  ];
  if (icp.examples.length) lines.push(`- Exemplos: ${icp.examples.join(', ')}`);
  lines.push(`- KPIs primários: ${icp.primaryKpis.join(', ')}`);
  return lines.join('\n');
}

function renderIcpShort(icp: IcpProfile): string {
  return `## ICP: ${icp.id} (resumido)\n- Segmento: ${icp.segment}`;
}

function renderMacroFull(m: MacroSnapshot): string {
  return [
    `## Macro snapshot (${m.asOfDate}, ${m.source})`,
    `- Selic: ${m.series.selic.last}%`,
    `- IPCA 12m: ${m.series.ipca12m.last}%`,
    `- INCC 12m: ${m.series.incc12m.last}%`,
    `- IGP-M 12m: ${m.series.igpm12m.last}%`,
    `- TR 12m: ${m.series.tr12m.last}%`,
  ].join('\n');
}

function renderMacroShort(m: MacroSnapshot): string {
  return `## Macro (${m.asOfDate}, ${m.source}) — Selic ${m.series.selic.last}% | IPCA12m ${m.series.ipca12m.last}% | INCC ${m.series.incc12m.last}% | IGP-M ${m.series.igpm12m.last}% | TR ${m.series.tr12m.last}%`;
}

function renderGlossary(terms: string[]): string {
  const lines: string[] = ['## Glossário relevante (subset)'];
  for (const t of terms.slice(0, 10)) {
    const e = getGlossaryEntry(t);
    if (e) {
      lines.push(`- **${e.term}**: ${e.definition.slice(0, 200)}`);
    }
  }
  return lines.length === 1 ? '' : lines.join('\n');
}

function renderTemplate(t: DashboardTemplate | null | undefined): string {
  if (!t) return '';
  const kpis = t.kpis
    .map((k) => `- ${k.label} (${k.priority})${k.formula ? `: \`${k.formula}\`` : ''}`)
    .join('\n');
  const visuals = t.visuals
    .map((v) => `- ${v.type}: ${v.title} → [${v.kpis.join(', ')}]`)
    .join('\n');
  const sections = [
    '## Template do dashboard',
    `Template: \`${t.id}\` (persona=${t.persona}, client=${t.client})`,
    '### KPIs prioritários',
    kpis,
    '### Visuais sugeridos',
    visuals,
  ];
  if (t.tables && t.tables.length > 0) {
    const tables = t.tables
      .map((tb) => `- ${tb.title} → [${tb.columns.join(', ')}]`)
      .join('\n');
    sections.push('### Tabelas sugeridas', tables);
  }
  return sections.join('\n');
}

function renderRetrieved(retrieved: RetrievedChunk[], topN = 3): string {
  if (!retrieved || retrieved.length === 0) return '';
  const top = retrieved.slice(0, topN);
  const items = top
    .map(
      (c, i) =>
        `${i + 1}. (score ${c.score.toFixed(2)}) ${c.text.slice(0, 400)} [source: ${c.metadata.sourceDoc}]`,
    )
    .join('\n\n');
  return ['## Contexto recuperado', items].join('\n');
}

export function buildAgentSystem({
  clientId,
  context,
  macro,
  baseInstructions,
  retrievedContext,
}: BuildAgentSystemArgs): string {
  const { client, persona, icp } = context;
  const header = `# Contexto dinâmico\nclient=${clientId} persona=${persona.id} icp=${icp?.id ?? 'none'} glossary=${GLOSSARY_VERSION}`;
  const clientBlock = renderClient(clientId, client);
  const personaBlock = renderPersona(persona);
  let icpBlock = icp ? renderIcpFull(icp) : '';
  let macroBlock = renderMacroFull(macro);
  const glossary = renderGlossary(persona.priorityKpis);
  const templateBlock = renderTemplate(retrievedContext?.template);
  let retrievedBlock = retrievedContext
    ? renderRetrieved(retrievedContext.retrieved)
    : '';

  // Stable order (cache-friendly): static (header→client→persona→icp) →
  // template → retrieved → macro → glossary → base.
  const compose = (): string =>
    [
      header,
      clientBlock,
      personaBlock,
      icpBlock,
      templateBlock,
      retrievedBlock,
      macroBlock,
      glossary,
      baseInstructions,
    ]
      .filter((s) => s.length > 0)
      .join('\n\n');

  let composed = compose();
  // Drop retrieved chunks first under token pressure (keep template/static).
  if (TOK(composed) > 10000 && retrievedBlock.length > 0) {
    retrievedBlock = '';
    composed = compose();
  }
  if (TOK(composed) > 8000 && icp) {
    icpBlock = renderIcpShort(icp);
    composed = compose();
  }
  if (TOK(composed) > 12000) {
    macroBlock = renderMacroShort(macro);
    composed = compose();
  }
  return composed;
}
