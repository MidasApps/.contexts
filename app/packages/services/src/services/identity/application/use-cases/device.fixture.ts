// Test world of the device use cases: the access write world (org-a > p1, an owner and an
// admin), in-memory devices and activations, a fake Firebase Auth and a movable clock.
import { OrganizationIdSchema } from "@core/contracts";
import {
  makeAccessWriteWorld,
  nodes,
  system,
  user,
} from "../../../access/application/use-cases/access-write.fixture.ts";
import { createAccessServices } from "../../../access/composition.ts";
import { createInMemoryAuditLogWriter } from "../../../audit/adapters/driven/in-memory-audit-log-writer.ts";
import { makeRecordAudit } from "../../../audit/application/use-cases/record-audit.ts";
import { inMemoryUnitOfWork } from "../../../shared/firestore/unit-of-work.ts";
import { createLogger } from "../../../shared/observability/logger.ts";
import { createFakeFirebaseAuth } from "../../adapters/driven/fake-firebase-auth.ts";
import {
  createInMemoryDeviceActivationRepository,
  createInMemoryDeviceRepository,
} from "../../adapters/driven/in-memory-device-repositories.ts";
import { createDeviceServices } from "../../device-composition.ts";

export const DEVICE_NOW = "2026-09-30T12:00:00.000Z";

export const buildDeviceWorld = async () => {
  let now = new Date(DEVICE_NOW);
  const clock = { now: () => new Date(now.getTime()) };
  const world = makeAccessWriteWorld();
  await world.grant("owner", nodes.orgA, [system("owner")]);
  await world.grant("admin", nodes.orgA, [system("admin")]);
  world.store.putUser("stranger");
  const writer = createInMemoryAuditLogWriter();
  const audit = makeRecordAudit({ writer, clock });
  // Grants written by the device vertical use the same in-memory access store as `authorize()`.
  const access = createAccessServices({ ...world.deps, audit, clock });
  const deviceRows = createInMemoryDeviceRepository();
  const activations = createInMemoryDeviceActivationRepository();
  const auth = createFakeFirebaseAuth();
  let random = 0;
  const devices = createDeviceServices({
    devices: deviceRows,
    activations,
    access,
    accessCore: world.core,
    customTokens: auth.customTokens,
    authUsers: auth.authUsers,
    audit,
    unitOfWork: inMemoryUnitOfWork,
    clock,
    randomBytes: (size) => new Uint8Array(size).fill((random += 13) % 256),
    logger: createLogger({ context: { service: "test", env: "local" }, sink: () => undefined }),
  });
  const admin = user("admin");
  /** A pending activation at p1 with the `device` role; returns its code. */
  const activationCode = async (): Promise<string> => {
    const created = await devices.createDeviceActivation({
      actor: admin,
      access: world.access(),
      tenantId: OrganizationIdSchema.parse("org-a"),
      input: { label: "Front desk tablet", node: nodes.p1, roles: [system("device")] },
      requestId: "seed",
    });
    if (!created.ok) throw created.error;
    return created.data.code;
  };
  return {
    ...world,
    devices,
    deviceRows,
    activations,
    auth,
    admin,
    stranger: user("stranger"),
    activationCode,
    audited: () => writer.entries("tenant").map((entry) => entry.action),
    setNow: (iso: string) => {
      now = new Date(iso);
    },
  };
};
