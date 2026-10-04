import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { defineContract } from "../src/contracts/contract.ts";
import { defineEndpoint } from "../src/contracts/http/endpoint.ts";
import { ErrorEnvelopeContract } from "../src/contracts/http/envelopes.schema.ts";
import { createContractRegistry } from "../src/contracts/registry.ts";
import { buildCatalogArtifacts, type CatalogArtifact } from "./catalog/artifacts.ts";
import {
  findContractProblems,
  findDanglingRefsInArtifacts,
  findRawMetaInArtifacts,
} from "./catalog/contract-problems.ts";
import { findCatalogDrift } from "./catalog/drift.ts";
import { findRawMetaKeys } from "./catalog/json-schema.ts";

const buildContracts = () => {
  const contact = defineContract(
    z.object({
      id: z
        .string()
        .min(1)
        .meta({ description: "Automatic id.", pii: "none", ui: { widget: "hidden" } }),
      email: z.email().meta({ description: "Contact e-mail.", pii: "personal", examples: ["ana@example.com"] }),
      taxId: z.string().meta({ description: "Tax id.", pii: "sensitive" }).optional(),
    }),
    {
      id: "people.Contact",
      kind: "entity",
      description: "A person the tenant talks to.",
      examples: [{ id: "a1", email: "ana@example.com", taxId: "123" }],
      pii: "sensitive",
      tenancyScope: "organization",
      relations: [],
    },
  );
  const tag = defineContract(z.object({ label: z.string().meta({ description: "Label.", pii: "none" }) }), {
    id: "alpha.Tag",
    kind: "settings",
    description: "A tag.",
    examples: [{ label: "vip" }],
    pii: "none",
    tenancyScope: "project",
    relations: [{ target: "people.Contact", type: "references", field: "label" }],
  });
  return createContractRegistry([contact, tag]).listContracts();
};

const getContact = defineEndpoint({
  id: "people.getContact",
  method: "GET",
  path: "/v1/contacts/{contactId}",
  auth: "user",
  params: z.object({ contactId: z.string().min(1) }),
  responses: {
    200: z.object({ data: z.object({ email: z.email().meta({ description: "E-mail.", pii: "personal" }) }) }),
  },
  errors: { 404: ["NOT_FOUND"] },
  summary: "Reads a contact.",
});

const findArtifact = (artifacts: CatalogArtifact[], path: string): string => {
  const artifact = artifacts.find((candidate) => candidate.path === path);
  if (artifact === undefined) throw new Error(`missing artifact ${path}`);
  return artifact.content;
};

type CatalogFile = { contracts: Record<string, unknown>[] };
const readJson = (artifacts: CatalogArtifact[], path: string): CatalogFile =>
  JSON.parse(findArtifact(artifacts, path)) as CatalogFile;

describe("buildCatalogArtifacts", () => {
  it("emits catalog, AI catalog, OpenAPI and one markdown and JSON Schema per contract", () => {
    const paths = buildCatalogArtifacts(buildContracts()).map((artifact) => artifact.path);
    expect(paths).toEqual([
      "docs/catalog/alpha/Tag.md",
      "docs/catalog/alpha/Tag.schema.json",
      "docs/catalog/catalog.ai.json",
      "docs/catalog/catalog.json",
      "docs/catalog/people/Contact.md",
      "docs/catalog/people/Contact.schema.json",
      "docs/openapi/v1.yaml",
    ]);
  });

  it("lists contracts sorted by id with their field metadata", () => {
    const catalog = readJson(buildCatalogArtifacts(buildContracts()), "docs/catalog/catalog.json");
    expect(catalog.contracts.map((contract) => contract["id"])).toEqual(["alpha.Tag", "people.Contact"]);
    expect(catalog.contracts[1]).toMatchObject({
      context: "people",
      name: "Contact",
      fields: [
        { name: "email", pii: "personal", required: true },
        { name: "id", pii: "none", required: true, ui: { widget: "hidden" } },
        { name: "taxId", pii: "sensitive", required: false },
      ],
    });
  });

  it("writes meta keys as x-* in JSON Schema and leaves no raw meta key", () => {
    const artifacts = buildCatalogArtifacts(buildContracts());
    const schema = JSON.parse(findArtifact(artifacts, "docs/catalog/people/Contact.schema.json")) as Record<
      string,
      unknown
    >;
    expect(schema).toMatchObject({ "x-pii": "sensitive", "x-kind": "entity", "x-tenancyScope": "organization" });
    expect(schema).toMatchObject({ properties: { email: { "x-pii": "personal" } } });
    expect(findRawMetaKeys(schema)).toEqual([]);
  });

  it("drops sensitive fields and redacts personal examples in the AI catalog", () => {
    const aiCatalog = findArtifact(buildCatalogArtifacts(buildContracts()), "docs/catalog/catalog.ai.json");
    expect(aiCatalog).not.toContain("taxId");
    expect(aiCatalog).not.toContain("ana@example.com");
    const contact = (JSON.parse(aiCatalog) as CatalogFile).contracts[1];
    expect(contact).toMatchObject({ examples: [{ id: "a1", email: "[redacted]" }] });
  });

  it("emits a valid OpenAPI 3.1 document with contracts as components", () => {
    const openapi = parseYaml(findArtifact(buildCatalogArtifacts(buildContracts()), "docs/openapi/v1.yaml")) as Record<
      string,
      unknown
    >;
    expect(openapi).toMatchObject({
      openapi: "3.1.0",
      paths: {},
      components: { schemas: { "people.Contact": { type: "object" } } },
    });
    expect(findRawMetaKeys(openapi["components"])).toEqual([]);
  });

  it("is deterministic", () => {
    expect(buildCatalogArtifacts(buildContracts())).toEqual(buildCatalogArtifacts(buildContracts()));
  });

  it("renders endpoints into OpenAPI paths, so drift covers them", () => {
    const contracts = buildContracts();
    const withoutEndpoints = buildCatalogArtifacts(contracts);
    const withEndpoint = buildCatalogArtifacts(contracts, [getContact]);
    const openapi = parseYaml(findArtifact(withEndpoint, "docs/openapi/v1.yaml")) as { paths: Record<string, unknown> };
    expect(Object.keys(openapi.paths)).toEqual(["/v1/contacts/{contactId}"]);
    const onDisk = new Map(withoutEndpoints.map((artifact) => [artifact.path, artifact.content]));
    expect(findCatalogDrift({ expected: withEndpoint, onDisk })).toEqual(["changed: docs/openapi/v1.yaml"]);
  });
});

describe("findCatalogDrift", () => {
  const expected: CatalogArtifact[] = [
    { path: "docs/catalog/catalog.json", content: "{}\n" },
    { path: "docs/openapi/v1.yaml", content: "openapi: 3.1.0\n" },
  ];

  it("reports nothing when files match, ignoring CRLF line endings", () => {
    const onDisk = new Map([
      ["docs/catalog/catalog.json", "{}\r\n"],
      ["docs/openapi/v1.yaml", "openapi: 3.1.0\n"],
    ]);
    expect(findCatalogDrift({ expected, onDisk })).toEqual([]);
  });

  it("reports changed, missing and stale files", () => {
    const onDisk = new Map([
      ["docs/catalog/catalog.json", '{ "edited": true }\n'],
      ["docs/catalog/old/Removed.md", "# gone\n"],
    ]);
    expect(findCatalogDrift({ expected, onDisk })).toEqual([
      "changed: docs/catalog/catalog.json",
      "missing: docs/openapi/v1.yaml",
      "stale: docs/catalog/old/Removed.md",
    ]);
  });
});

describe("findContractProblems", () => {
  it("reports relations whose target is not in the catalog", () => {
    const contracts = buildContracts().filter((contract) => contract.id === "alpha.Tag");
    expect(findContractProblems(contracts)).toEqual(["unknown relation target: alpha.Tag -> people.Contact"]);
  });

  it("reports nothing for a consistent catalog", () => {
    expect(findContractProblems(buildContracts())).toEqual([]);
  });
});

describe("findDanglingRefsInArtifacts", () => {
  it("reports an error response whose ErrorEnvelope component is missing", () => {
    const artifacts = buildCatalogArtifacts(buildContracts(), [getContact]);
    expect(findDanglingRefsInArtifacts(artifacts)).toEqual([
      "docs/openapi/v1.yaml: dangling $ref: #/components/schemas/http.ErrorEnvelope",
    ]);
  });

  it("reports nothing when every referenced component exists", () => {
    const contracts = createContractRegistry([...buildContracts(), ErrorEnvelopeContract]).listContracts();
    expect(findDanglingRefsInArtifacts(buildCatalogArtifacts(contracts, [getContact]))).toEqual([]);
  });
});

describe("findRawMetaInArtifacts", () => {
  it("reports custom meta keys that were not renamed to x-*", () => {
    const artifacts: CatalogArtifact[] = [
      {
        path: "docs/catalog/a/B.schema.json",
        content: JSON.stringify({ properties: { pii: { type: "string", pii: "none" } } }),
      },
    ];
    expect(findRawMetaInArtifacts(artifacts)).toEqual([
      "raw meta key: docs/catalog/a/B.schema.json #/properties/pii/pii",
    ]);
  });

  it("finds no raw keys in generated artifacts", () => {
    expect(findRawMetaInArtifacts(buildCatalogArtifacts(buildContracts(), [getContact]))).toEqual([]);
  });
});
