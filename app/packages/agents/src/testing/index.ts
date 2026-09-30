// Test fakes of @core/agents (`@core/agents/testing`). Explicit named re-exports only.
export {
  createFakeAccessPort,
  createFakeApprovalPort,
  createFakeAuditPort,
  createFakeRuntimePorts,
  createFakeSettingsPort,
  createFakeUsagePort,
  defaultAgentSettings,
  FAKE_REGIONAL,
  type FakeAccessPort,
  type FakeApprovalPort,
  type FakeAuditPort,
  type FakeMembership,
  type FakeUsagePort,
  grantHolderOf,
} from "./fake-ports.ts";
export {
  type AgentContextOverrides,
  buildAgentContextEntries,
  TEST_REQUEST_ID,
  TEST_TENANT,
  TEST_UID,
} from "./agent-context-fixture.ts";
