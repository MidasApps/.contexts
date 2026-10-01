import { expectNoAxeViolations } from "@core/e2e/axe";
import { chatPanel, expect, expectAnswered, messageLog, openChat, send, SIGNED_OUT, test } from "./chat-test.ts";

// SP4 gate, part 2 (umbrella §8, §16.2): a file goes to the Storage Emulator through a signed
// upload, the Functions trigger validates it (magic bytes), and the sent message carries it; a file
// whose content does not match its type is refused and never sent.

test.use({ storageState: SIGNED_OUT });

// A 1×1 transparent PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
// The local file header of a zip, named as an image.
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x21, 0x00]);

const chips = (page: Parameters<typeof chatPanel>[0]) => chatPanel(page).getByRole("list", { name: "Anexos da mensagem" });

type Ticket = { fileId: string; upload: { method: string; url: string; headers: Record<string, string> } };

// The first upload of a fresh emulator suite waits while the Functions emulator starts the
// trigger's worker (a minute on a loaded machine), longer than the 30 s the client polls. One
// upload through the API before the journeys warms it; it is not part of what they assert.
test.beforeAll(async ({ ownerApi, world }) => {
  test.setTimeout(180_000);
  const body = Buffer.from("warm-up\n");
  const ticket = await ownerApi.post<Ticket>(`/v1/organizations/${world.alpha.id}/files`, { purpose: "chat-attachment", fileName: "warm-up.txt", contentType: "text/plain", sizeBytes: body.length });
  const sent = await fetch(ticket.upload.url, { method: ticket.upload.method, headers: ticket.upload.headers, body });
  expect(sent.ok).toBe(true);
  await expect.poll(async () => (await ownerApi.get<{ status: string }>(`/v1/files/${ticket.fileId}`)).status, { timeout: 150_000, intervals: [1_000] }).not.toBe("pending");
});

test("attaches a file, waits for its check and shows it in the sent message", async ({ page, world, signInFresh }) => {
  test.setTimeout(120_000);
  await signInFresh();
  await openChat(page, world);
  await chatPanel(page).getByLabel("Arquivos para anexar").setInputFiles([
    { name: "nota.txt", mimeType: "text/plain", buffer: Buffer.from("Meeting notes of the week.\n") },
    { name: "diagram.png", mimeType: "image/png", buffer: PNG },
  ]);
  await expect(chips(page).locator('[data-status="ready"]')).toHaveCount(2, { timeout: 60_000 });
  await expect(chips(page)).toContainText("nota.txt");
  await expect(chips(page)).toContainText("Pronto");
  await expectNoAxeViolations(page);

  await send(page, "What do these files say?");
  await expectAnswered(page);
  const sent = messageLog(page).getByRole("article", { name: "Você" });
  const attachments = sent.getByRole("list", { name: "Anexos" });
  await expect(attachments).toContainText("nota.txt");
  await expect(attachments).toContainText("diagram.png");
  await expect(chips(page)).toHaveCount(0);
});

test("refuses a file whose content does not match its type, and does not send it", async ({ page, world, signInFresh }) => {
  test.setTimeout(120_000);
  await signInFresh();
  await openChat(page, world);
  await chatPanel(page).getByLabel("Arquivos para anexar").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: ZIP });
  const chip = chips(page).locator('[data-status="rejected"]');
  await expect(chip).toContainText("O conteúdo não corresponde ao tipo do arquivo", { timeout: 60_000 });
  await send(page, "Here is the photo");
  await expect(chatPanel(page).getByText("Remova ou reenvie os anexos com erro antes de enviar.")).toBeVisible();
  await expect(messageLog(page).getByRole("article")).toHaveCount(0);

  await chips(page).getByRole("button", { name: "Remover photo.png" }).click();
  await expect(chips(page)).toHaveCount(0);
  await send(page, "Here is the text instead");
  await expectAnswered(page);
  await expect(messageLog(page).getByRole("article", { name: "Você" }).getByRole("list", { name: "Anexos" })).toHaveCount(0);
});
