/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VoiceChoice } from "./voice-choice";
import type { NarrationEngineId } from "@/lib/narration/engines";
import type { VoiceId } from "@/lib/voices/catalog";

const roots: Root[] = [];
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function renderVoiceChoice(
  onVoiceChange = vi.fn(),
  selectedVoiceId: VoiceId | null = null,
  narrationEngineId: NarrationEngineId = "kokoro",
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  act(() => {
    root.render(
      <VoiceChoice
        narrationEngineId={narrationEngineId}
        onVoiceChange={onVoiceChange}
        selectedVoiceId={selectedVoiceId}
      />,
    );
  });

  return { container, onVoiceChange };
}

function getPreviewButton(container: HTMLElement, label: string) {
  const button = container.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!button) {
    throw new Error(`Missing preview button: ${label}`);
  }
  return button;
}

describe("VoiceChoice", () => {
  const play = vi.fn(() => Promise.resolve());
  const pause = vi.fn();
  const load = vi.fn();

  beforeEach(() => {
    play.mockClear();
    pause.mockClear();
    load.mockClear();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(load);
  });

  afterEach(() => {
    for (const root of roots.splice(0, roots.length)) {
      act(() => root.unmount());
    }
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("renders one labeled radio and one preview action for every catalog voice", () => {
    const { container } = renderVoiceChoice();
    const fieldset = container.querySelector("fieldset");
    const radios = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')];

    expect(fieldset?.querySelector("legend")?.textContent).toBe("Choose a voice");
    expect(radios).toHaveLength(3);
    expect(radios.map((radio) => radio.name)).toEqual(["voice", "voice", "voice"]);
    expect(radios.map((radio) => radio.value)).toEqual([
      "marlowe",
      "sloane",
      "jules",
    ]);
    expect(
      radios.map((radio) =>
        container.querySelector(`label[for="${radio.id}"]`)?.textContent,
      ),
    ).toEqual([
      expect.stringContaining("Marlowe"),
      expect.stringContaining("Sloane"),
      expect.stringContaining("Jules"),
    ]);
    expect(container.querySelectorAll('button[aria-label^="Play "]')).toHaveLength(3);
  });

  it("reports the selected voice through the native radio control", () => {
    const onVoiceChange = vi.fn();
    const { container } = renderVoiceChoice(onVoiceChange);
    const sloane = container.querySelector<HTMLInputElement>("#voice-choice-sloane");

    act(() => sloane?.click());

    expect(onVoiceChange).toHaveBeenCalledWith("sloane");
  });

  it("plays one honest preview URL at a time and can stop it", async () => {
    const { container } = renderVoiceChoice();

    await act(async () => {
      getPreviewButton(container, "Play Sloane preview").click();
      await Promise.resolve();
    });

    const audio = container.querySelector("audio");
    expect(audio?.getAttribute("src")).toBe(
      "/api/voices/sloane/preview?engine=kokoro",
    );
    expect(load).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledOnce();

    act(() => getPreviewButton(container, "Stop Sloane preview").click());

    expect(pause).toHaveBeenCalled();
    expect(audio?.currentTime).toBe(0);
    expect(getPreviewButton(container, "Play Sloane preview")).toBeTruthy();
  });

  it("shows an actionable error when preview playback fails", async () => {
    play.mockRejectedValueOnce(new Error("preview unavailable"));
    const { container } = renderVoiceChoice();

    await act(async () => {
      getPreviewButton(container, "Play Jules preview").click();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Start local narration and try again",
    );
    expect(getPreviewButton(container, "Play Jules preview")).toBeTruthy();
  });

  it("offers only the verified narrator for the High Quality engine", async () => {
    const { container } = renderVoiceChoice(
      vi.fn(),
      "chatterbox-default",
      "chatterbox",
    );
    const radios = [
      ...container.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    ];

    expect(radios.map((radio) => radio.value)).toEqual(["chatterbox-default"]);
    expect(container.textContent).toContain("never accepts reference audio");

    await act(async () => {
      getPreviewButton(container, "Play High Quality Narrator preview").click();
      await Promise.resolve();
    });

    expect(container.querySelector("audio")?.getAttribute("src")).toBe(
      "/api/voices/chatterbox-default/preview?engine=chatterbox",
    );
  });
});
