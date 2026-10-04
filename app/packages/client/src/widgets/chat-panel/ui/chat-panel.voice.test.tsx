import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFakeMicrophone } from "#/features/chat-voice/testing/fake-microphone.ts";
import { expectNoAxeViolations } from "#/shared/testing/axe.ts";
import { apiError, createFakeApi, type FakeApi, ok } from "#/shared/testing/fake-api.ts";
import { IDS } from "#/shared/testing/fixtures.ts";
import { renderWithClient } from "#/shared/testing/render-client.tsx";
import { TooltipProvider } from "#/shared/ui/atoms/Tooltip/Tooltip.tsx";
import { createFakeChatTransport, type FakeChatTransport, textChunks } from "../testing/fake-chat-transport.ts";
import { ChatPanel, type ChatPanelProps } from "./chat-panel.tsx";

const SCOPE = { organizationId: IDS.organization, projectId: IDS.project };
const VOICE = new Set(["core.voice.use"]);
const LOADED = { timeout: 5000 };

const voiceApi = (availability: { voice: boolean; realtime: boolean }): FakeApi =>
  createFakeApi({
    "GET /v1/voice/availability": ok(availability),
    "POST /v1/voice/transcriptions": ok({ text: "qual é o prazo", language: "pt", durationInSeconds: 2 }),
    "POST /v1/voice/speech": { status: 200, body: { audio: "bytes" } },
    "POST /v1/voice/realtime-sessions": apiError(503, "FEATURE_UNAVAILABLE"),
  });

const setup = (api: FakeApi, granted: ReadonlySet<string> = VOICE, props: Partial<ChatPanelProps> = {}) => {
  const transport = createFakeChatTransport();
  const microphone = createFakeMicrophone();
  const urls = { created: 0, revoked: [] as string[] };
  const view = renderWithClient(
    <TooltipProvider>
      <ChatPanel
        scope={SCOPE}
        can={(permission) => granted.has(permission)}
        voiceSeams={{ getUserMedia: microphone.getUserMedia, createRecorder: microphone.createRecorder }}
        speechSeams={{
          createUrl: () => `blob:speech-${(urls.created += 1)}`,
          revokeUrl: (url) => void urls.revoked.push(url),
        }}
        {...props}
        transport={transport}
      />
    </TooltipProvider>,
    { api },
  );
  const field = () => screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Mensagem" });
  return { ...view, transport, microphone, urls, field, api };
};

const talkButton = () => screen.findByRole("button", { name: "Falar: segure para gravar" }, LOADED);

const answer = async (transport: FakeChatTransport, text: string) => {
  await waitFor(() => expect(transport.streams.length).toBeGreaterThan(0));
  act(() => {
    transport.streams.at(-1)?.emit(...textChunks([text]));
    transport.streams.at(-1)?.close();
  });
  await screen.findByText(text);
};

describe("ChatPanel voice (flag gated)", () => {
  it("shows no voice control while the organization's voice flag is off", async () => {
    const api = voiceApi({ voice: false, realtime: false });
    const { user, transport, field } = setup(api);
    await waitFor(() => expect(api.callLines()).toContain("GET /v1/voice/availability"));
    await user.type(field(), "oi{Enter}");
    await answer(transport, "Olá.");
    expect(screen.queryByRole("button", { name: /Falar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Opções de voz" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ouvir resposta" })).toBeNull();
  });

  it("does not even ask for a member without the voice permission", async () => {
    const api = voiceApi({ voice: true, realtime: true });
    const { user, transport, field } = setup(api, new Set());
    await user.type(field(), "oi{Enter}");
    await answer(transport, "Olá.");
    expect(screen.queryByRole("button", { name: /Falar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ouvir resposta" })).toBeNull();
    expect(api.callLines()).not.toContain("GET /v1/voice/availability");
  });

  it("records with one press, stops with the next, and puts the transcript in the draft without sending", async () => {
    const api = voiceApi({ voice: true, realtime: false });
    const { user, transport, microphone, field, container } = setup(api);
    const button = await talkButton();
    expect(button.getAttribute("aria-pressed")).toBe("false");
    await user.type(field(), "Sobre o contrato:");
    button.focus();
    await user.keyboard("{Enter}");
    const stop = await screen.findByRole("button", { name: "Parar a gravação e transcrever" });
    expect(stop.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Gravando… solte para transcrever")).toBeTruthy();
    await expectNoAxeViolations(container);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(field().value).toBe("Sobre o contrato: qual é o prazo"));
    expect(transport.streams).toHaveLength(0);
    expect(microphone.released()).toBe(1);
    expect(document.activeElement).toBe(field());
    expect(screen.getByText("Transcrição inserida na mensagem.")).toBeTruthy();
    const upload = api.calls.find((call) => call.path === "/v1/voice/transcriptions");
    expect(upload?.query).toBe(`?organizationId=${IDS.organization}`);
    expect(upload?.headers.get("authorization")).toMatch(/^Bearer /);
  });

  it("records while the pointer is held and with Ctrl+Shift+Space from anywhere, leaving Ctrl+Space to the system", async () => {
    const api = voiceApi({ voice: true, realtime: false });
    const { user, microphone, field } = setup(api);
    const button = await talkButton();
    await user.pointer({ keys: "[MouseLeft>]", target: button });
    await waitFor(() => expect(microphone.recorders[0]?.state()).toBe("recording"));
    await user.pointer({ keys: "[/MouseLeft]", target: button });
    await waitFor(() => expect(field().value).toBe("qual é o prazo"));
    await user.clear(field());
    // Ctrl+Space switches the input method on Windows and macOS: it must not start a recording.
    await user.keyboard("{Control>} {/Control}");
    expect(microphone.recorders).toHaveLength(1);
    await user.keyboard("{Control>}{Shift>} {/Shift}{/Control}");
    await waitFor(() => expect(microphone.recorders[1]?.state()).toBe("recording"));
    await user.keyboard("{Control>}{Shift>} {/Shift}{/Control}");
    await waitFor(() => expect(field().value).toBe("qual é o prazo"));
  });

  it("says that the microphone is blocked when permission is denied", async () => {
    const api = voiceApi({ voice: true, realtime: false });
    const denied = createFakeMicrophone({ refuse: "NotAllowedError" });
    const { user } = setup(api, VOICE, {
      voiceSeams: { getUserMedia: denied.getUserMedia, createRecorder: denied.createRecorder },
    });
    (await talkButton()).focus();
    await user.keyboard("{Enter}");
    expect(
      await screen.findByText("Microfone bloqueado. Permita o acesso ao microfone nas configurações do navegador."),
    ).toBeTruthy();
  });

  it("sends the transcript at once with auto-send on", async () => {
    const api = voiceApi({ voice: true, realtime: false });
    const { user, transport } = setup(api);
    await talkButton();
    await user.click(screen.getByRole("button", { name: "Opções de voz" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Enviar após transcrever" }));
    const button = await talkButton();
    button.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("button", { name: "Parar a gravação e transcrever" });
    await user.keyboard("{Enter}");
    await waitFor(() => expect(transport.streams).toHaveLength(1));
    expect(transport.streams[0]?.messages.at(-1)).toMatchObject({
      role: "user",
      parts: [{ type: "text", text: "qual é o prazo" }],
    });
  });

  it("says the organization's AI budget ran out when transcription or read aloud answers BUDGET_EXCEEDED", async () => {
    const api = createFakeApi({
      "GET /v1/voice/availability": ok({ voice: true, realtime: false }),
      "POST /v1/voice/transcriptions": apiError(429, "BUDGET_EXCEEDED"),
      "POST /v1/voice/speech": apiError(429, "BUDGET_EXCEEDED"),
    });
    const { user, transport, field } = setup(api);
    const budget = "O orçamento de IA da organização acabou. Fale com um administrador.";
    const button = await talkButton();
    button.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("button", { name: "Parar a gravação e transcrever" });
    await user.keyboard("{Enter}");
    expect(await screen.findByText(budget)).toBeTruthy();
    await user.type(field(), "oi{Enter}");
    await answer(transport, "O prazo é de 30 dias.");
    await user.click(await screen.findByRole("button", { name: "Ouvir resposta" }));
    await waitFor(() => expect(screen.getAllByText(budget)).toHaveLength(2));
  });

  it("reads an answer aloud with the returned audio and frees it when stopped", async () => {
    const api = voiceApi({ voice: true, realtime: false });
    const { user, transport, urls, field, container } = setup(api);
    await talkButton();
    await user.type(field(), "oi{Enter}");
    await answer(transport, "O prazo é de 30 dias.");
    await user.click(await screen.findByRole("button", { name: "Ouvir resposta" }));
    const player = await waitFor(() => {
      const audio = container.querySelector("audio");
      if (audio === null) throw new Error("no player yet");
      return audio;
    });
    expect(player.getAttribute("src")).toBe("blob:speech-1");
    expect(player.getAttribute("aria-label")).toBe("Resposta em áudio");
    expect(api.calls.find((call) => call.path === "/v1/voice/speech")?.body).toEqual({ text: "O prazo é de 30 dias." });
    await user.click(screen.getByRole("button", { name: "Parar leitura" }));
    expect(container.querySelector("audio")).toBeNull();
    expect(urls.revoked).toEqual(["blob:speech-1"]);
  });

  it("reads the next finished answer by itself with 'read answers aloud' on", async () => {
    const api = voiceApi({ voice: true, realtime: false });
    const { user, transport, field, container } = setup(api);
    await talkButton();
    await user.click(screen.getByRole("button", { name: "Opções de voz" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Ler respostas em voz alta" }));
    await user.type(field(), "oi{Enter}");
    await answer(transport, "Olá.");
    await waitFor(() => expect(container.querySelector("audio")?.getAttribute("src")).toBe("blob:speech-1"));
  });

  it("shows the realtime conversation live, and a failed start in visible words", async () => {
    const api = voiceApi({ voice: true, realtime: true });
    api.route(
      "POST /v1/voice/realtime-sessions",
      ok({ clientSecret: "ek_test", expiresAt: "2026-10-01T12:01:00.000Z", model: "gpt-realtime" }, 201),
    );
    let fail = false;
    const connectRealtime = () =>
      fail ? Promise.reject(new Error("webrtc failed")) : Promise.resolve({ close: () => undefined });
    const { user } = setup(api, VOICE, { voiceSeams: { connectRealtime } });
    await user.click(await screen.findByRole("button", { name: "Iniciar conversa por voz (experimental)" }, LOADED));
    const status = () => document.querySelector("[data-slot=realtime-status]") as HTMLElement;
    await waitFor(() => expect(status().textContent).toBe("Conversa por voz ativa."));
    expect(status().classList.contains("sr-only")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Encerrar conversa por voz" }));
    fail = true;
    await user.click(screen.getByRole("button", { name: "Iniciar conversa por voz (experimental)" }));
    await waitFor(() => expect(status().textContent).toBe("A conversa por voz falhou."));
    expect(status().className).toContain("text-destructive-text");
  });

  it("offers the realtime conversation only with its flag on, and withdraws it when the session route refuses", async () => {
    const off = setup(voiceApi({ voice: true, realtime: false }));
    await talkButton();
    expect(screen.queryByRole("button", { name: /conversa por voz/ })).toBeNull();
    off.unmount();
    const { user } = setup(voiceApi({ voice: true, realtime: true }));
    const start = await screen.findByRole("button", { name: "Iniciar conversa por voz (experimental)" }, LOADED);
    await user.click(start);
    await waitFor(() => expect(screen.queryByRole("button", { name: /conversa por voz/ })).toBeNull());
  });
});
