import { chatPanel, composer, expect, expectAnswered, messageLog, openChat, send, SIGNED_OUT, test } from "./chat-test.ts";

// SP4 gate (umbrella §8, D4-06): push-to-talk with Chromium's fake microphone goes through
// `/v1/voice/transcriptions` (fake model: "fake transcript <n> bytes") into the draft without
// sending it, and "read aloud" plays the speech of an answer. Voice is on in local (decision 0034).

test.use({
  storageState: SIGNED_OUT,
  permissions: ["microphone"],
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
});

test("records with the keyboard, puts the transcript in the draft and reads an answer aloud", async ({ page, world, signInFresh }) => {
  await signInFresh();
  await openChat(page, world);
  const talk = chatPanel(page).getByRole("button", { name: "Falar: segure para gravar" });
  await expect(talk).toBeVisible();

  await talk.focus();
  await page.keyboard.press("Enter");
  const stopRecording = chatPanel(page).getByRole("button", { name: "Parar a gravação e transcrever" });
  await expect(stopRecording).toBeVisible();
  await expect(chatPanel(page).getByText("Gravando… solte para transcrever")).toBeAttached();
  // A second press stops and sends the audio for transcription.
  await stopRecording.press("Enter");
  await expect(composer(page)).toHaveValue(/^fake transcript \d+ bytes$/, { timeout: 30_000 });
  await expect(messageLog(page).getByRole("article")).toHaveCount(0);

  await send(page, "Hello voice");
  await expectAnswered(page);
  const answer = messageLog(page).getByRole("article", { name: "Assistente" });
  await answer.getByRole("button", { name: "Ouvir resposta" }).click();
  const player = answer.locator('audio[data-slot="audio-player"]');
  await expect(player).toBeAttached({ timeout: 30_000 });
  await expect.poll(async () => player.evaluate((audio: HTMLAudioElement) => audio.src.startsWith("blob:"))).toBe(true);
  await answer.getByRole("button", { name: "Parar leitura" }).click();
  await expect(player).toHaveCount(0);
});
