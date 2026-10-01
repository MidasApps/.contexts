import { defineModule } from "@core/contracts";
import { EXAMPLE_CAPABILITIES } from "./capabilities.ts";
import { ExampleSettingsContract } from "./contracts/example-settings.schema.ts";
import enUS from "./messages/en-US.json" with { type: "json" };
import es419 from "./messages/es-419.json" with { type: "json" };
import ptBR from "./messages/pt-BR.json" with { type: "json" };

/**
 * The example module's data-only manifest (decision 0015 §1), safe on server and client: it is the
 * reference for new modules and exercises every manifest field. The apps list it in their
 * composition files; no core package imports it (umbrella D6).
 */
export const exampleManifest = defineModule({
  id: "example",
  labelKey: "example.module.name",
  permissions: [
    { id: "example.item.read", descriptionKey: "example.permissions.item.read", kind: "read", scope: "tenant", defaultRoles: ["owner", "admin", "member", "viewer"] },
    { id: "example.item.write", descriptionKey: "example.permissions.item.write", kind: "write", scope: "tenant", defaultRoles: ["owner", "admin"] },
  ],
  unitTypes: [{ id: "example.area", labelKey: "example.unitTypes.area", allowedParents: ["project", "example.area"] }],
  navigation: [{ id: "home", slot: "project", labelKey: "example.nav.home", icon: "puzzle", path: "", permission: "example.item.read", order: 100 }],
  settings: { contract: ExampleSettingsContract, readPermission: "example.item.read", updatePermission: "example.item.write" },
  messages: { "pt-BR": ptBR, "en-US": enUS, "es-419": es419 },
  ...EXAMPLE_CAPABILITIES,
});
