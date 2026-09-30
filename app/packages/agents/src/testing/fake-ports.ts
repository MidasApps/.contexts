import { type AgentSettings, AgentSettingsSchema, type LlmCall } from "@core/contracts";
import type {
  AccessContext,
  AccessPort,
  AccessPrincipal,
  AgentRuntimePorts,
  ApprovalPort,
  AuditEntry,
  AuditPort,
  BudgetCheck,
  FilesPort,
  KnowledgeEventsPort,
  NodeRef,
  ProjectsPort,
  RegionalSettings,
  SettingsPort,
  UsagePort,
  WebContentPort,
  WebPage,
} from "../runtime/runtime-ports.ts";
import type { StoredFile } from "@core/contracts";

/**
 * In-memory fakes for every runtime port (exported as `@core/agents/testing`).
 * They follow the SP1 rules the agents rely on: fail-closed, ceiling
 * intersection, `requiresApproval` copied from the permission.
 */

export const FAKE_REGIONAL: RegionalSettings = {
  locale: "pt-BR",
  displayTimeZone: "America/Sao_Paulo",
  nodeTimeZone: "America/Sao_Paulo",
  currency: "BRL",
};

export type FakeMembership = {
  readonly tenantId: string;
  readonly uid: string;
  readonly permissions: readonly string[];
  readonly regional?: RegionalSettings;
};

export type FakeAccessPort = AccessPort & {
  /** Every `verifyBearer` call, in order (checks the `checkRevoked` split). */
  readonly verifyCalls: { token: string; checkRevoked: boolean }[];
};

/** Uid whose grants count for the principal: the key owner for API keys (SP1 §5.2 step 3). */
export const grantHolderOf = (principal: AccessPrincipal): string | undefined => {
  if (principal.type === "user") return principal.uid;
  if (principal.type === "service") return principal.ownerUid;
  return undefined;
};

const tenantOf = (node: NodeRef): string | undefined => (node.level === "platform" ? undefined : node.tenantId);

const principalTenantMatches = (principal: AccessPrincipal, tenantId: string): boolean =>
  principal.type === "user" || principal.tenantId === tenantId;

export const createFakeAccessPort = (args: {
  credentials?: Readonly<Record<string, AccessPrincipal>>;
  memberships?: readonly FakeMembership[];
  /** Permissions whose definition has `requiresApproval: true`. */
  approvalPermissions?: readonly string[];
  /** API key scopes by `apiKeyId`: a key never exceeds them (SP1 `tenant-access.ts`). */
  apiKeyScopes?: Readonly<Record<string, readonly string[]>>;
}): FakeAccessPort => {
  const verifyCalls: { token: string; checkRevoked: boolean }[] = [];
  const membershipOf = (principal: AccessPrincipal, node: NodeRef): FakeMembership | undefined => {
    const tenantId = tenantOf(node);
    const uid = grantHolderOf(principal);
    if (tenantId === undefined || uid === undefined || !principalTenantMatches(principal, tenantId)) return undefined;
    return args.memberships?.find((membership) => membership.tenantId === tenantId && membership.uid === uid);
  };
  const scopesOf = (principal: AccessPrincipal): readonly string[] | undefined =>
    principal.type === "service" ? args.apiKeyScopes?.[principal.apiKeyId] : undefined;
  const effective = (principal: AccessPrincipal, node: NodeRef, ceiling?: ReadonlySet<string>): ReadonlySet<string> => {
    const scopes = scopesOf(principal);
    const granted = (membershipOf(principal, node)?.permissions ?? []).filter((permission) => scopes?.includes(permission) ?? true);
    return new Set(ceiling === undefined ? granted : granted.filter((permission) => ceiling.has(permission)));
  };
  return {
    verifyCalls,
    verifyBearer: ({ token, checkRevoked }) => {
      verifyCalls.push({ token, checkRevoked });
      return Promise.resolve(args.credentials?.[token] ?? null);
    },
    resolveAccessContext: ({ principal, node }) => {
      const membership = membershipOf(principal, node);
      if (membership === undefined || node.level === "platform") return Promise.resolve(null);
      const context: AccessContext = {
        tenantId: node.tenantId,
        ...(node.level === "organization" ? {} : { projectId: node.projectId }),
        ...(node.level === "unit" ? { unitId: node.unitId } : {}),
        principal,
        permissions: [...membership.permissions],
        regional: membership.regional ?? FAKE_REGIONAL,
      };
      return Promise.resolve(context);
    },
    authorize: ({ principal, permission, node, ceiling }) => {
      if (!effective(principal, node, ceiling).has(permission)) {
        return Promise.resolve({ allowed: false, reason: "PERMISSION_NOT_GRANTED" });
      }
      return Promise.resolve({ allowed: true, requiresApproval: args.approvalPermissions?.includes(permission) ?? false });
    },
    getEffectivePermissions: ({ principal, node, ceiling }) => Promise.resolve(effective(principal, node, ceiling)),
  };
};

export type FakeAuditPort = AuditPort & { readonly entries: AuditEntry[] };

export const createFakeAuditPort = (): FakeAuditPort => {
  const entries: AuditEntry[] = [];
  return {
    entries,
    record: (entry) => {
      entries.push(entry);
      return Promise.resolve();
    },
  };
};

export type FakeApprovalPort = ApprovalPort & { readonly requests: Parameters<ApprovalPort["requestApproval"]>[0][] };

export const createFakeApprovalPort = (): FakeApprovalPort => {
  const requests: Parameters<ApprovalPort["requestApproval"]>[0][] = [];
  return {
    requests,
    requestApproval: (input) => {
      requests.push(input);
      return Promise.resolve({ approvalId: `approval-${requests.length}` });
    },
  };
};

export type FakeUsagePort = UsagePort & { readonly calls: LlmCall[] };

export const createFakeUsagePort = (budget: BudgetCheck = { allowed: true, alert: false }): FakeUsagePort => {
  const calls: LlmCall[] = [];
  return {
    calls,
    recordLlmCalls: (rows) => {
      calls.push(...rows);
      return Promise.resolve();
    },
    checkTenantBudget: () => Promise.resolve(budget),
  };
};

export const defaultAgentSettings = (tenantId: string): AgentSettings =>
  AgentSettingsSchema.parse({
    tenantId,
    enabledAgents: ["knowledge", "data", "action"],
    webTools: { firecrawl: false, browser: false },
    guardrails: { pii: "warn" },
    budget: { monthlyMicroUsd: 50_000_000, monthlyTokens: 20_000_000 },
    updatedBy: null,
    createdAt: "2026-09-29T00:00:00.000Z",
    updatedAt: "2026-09-29T00:00:00.000Z",
  });

export const createFakeSettingsPort = (overrides: Partial<AgentSettings> = {}): SettingsPort => ({
  getAgentSettings: ({ tenantId }) => Promise.resolve({ ...defaultAgentSettings(tenantId), ...overrides }),
});

/** Ready files by id, with their bytes; tenant, status and purpose are checked like the `files` context. */
export const createFakeFilesPort = (files: readonly { readonly file: StoredFile; readonly bytes: Uint8Array }[] = []): FilesPort => {
  const find = (input: { tenantId: string; fileId: string; purpose: StoredFile["purpose"] }) => {
    const entry = files.find(({ file }) => file.id === input.fileId && file.tenantId === input.tenantId);
    if (entry === undefined) return { ok: false as const, error: "FILE_NOT_FOUND" as const };
    if (entry.file.status !== "ready") return { ok: false as const, error: "FILE_NOT_READY" as const };
    if (entry.file.purpose !== input.purpose) return { ok: false as const, error: "FILE_PURPOSE_MISMATCH" as const };
    return { ok: true as const, data: entry };
  };
  return {
    getReadyFile: (input) => {
      const found = find(input);
      return Promise.resolve(found.ok ? { ok: true, data: found.data.file } : found);
    },
    readFileBytes: (input) => Promise.resolve(find(input)),
  };
};

/** Fixture pages by URL (the fake Firecrawl of `AI_MODE=fake`); an unknown URL rejects. */
export const createFakeWebContentPort = (pages: readonly WebPage[] = []): WebContentPort & { readonly scraped: string[] } => {
  const scraped: string[] = [];
  return {
    scraped,
    scrape: ({ url }) => {
      scraped.push(url);
      const page = pages.find((candidate) => candidate.url === url);
      return page === undefined ? Promise.reject(new Error(`no fixture page for ${url}`)) : Promise.resolve(page);
    },
  };
};

export type RecordingKnowledgeEvents = KnowledgeEventsPort & { readonly events: Parameters<KnowledgeEventsPort["documentIndexed"]>[0][] };

export const createRecordingKnowledgeEvents = (): RecordingKnowledgeEvents => {
  const events: Parameters<KnowledgeEventsPort["documentIndexed"]>[0][] = [];
  return {
    events,
    documentIndexed: (event) => {
      events.push(event);
      return Promise.resolve();
    },
  };
};

export type FakeProjectsPort = ProjectsPort & { readonly created: Parameters<ProjectsPort["createProject"]>[0][] };

/** Records every created project; ids are `project-<n>`. */
export const createFakeProjectsPort = (): FakeProjectsPort => {
  const created: Parameters<ProjectsPort["createProject"]>[0][] = [];
  return {
    created,
    createProject: (input) => {
      created.push(input);
      return Promise.resolve({ ok: true, data: { projectId: `project-${created.length}`, name: input.input.name } });
    },
  };
};

const notWired = (name: string) => () => Promise.reject(new Error(`${name} is not faked in this test`));

/** Every port faked; override any of them per test. */
export const createFakeRuntimePorts = (overrides: Partial<AgentRuntimePorts> = {}): AgentRuntimePorts => ({
  access: createFakeAccessPort({}),
  audit: createFakeAuditPort(),
  approvals: createFakeApprovalPort(),
  usage: createFakeUsagePort(),
  knowledge: { searchChunks: () => Promise.resolve([]), registerDocument: notWired("registerDocument"), replaceChunks: notWired("replaceChunks") },
  files: createFakeFilesPort(),
  webContent: createFakeWebContentPort(),
  knowledgeEvents: createRecordingKnowledgeEvents(),
  connectors: { listActive: () => Promise.resolve([]) },
  secrets: { get: () => Promise.resolve(null) },
  settings: createFakeSettingsPort(),
  catalog: { runSemanticQuery: () => Promise.resolve({ ok: false, error: { code: "CONNECTOR_DISABLED" } }) },
  projects: createFakeProjectsPort(),
  ...overrides,
});
