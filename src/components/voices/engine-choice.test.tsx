/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EngineChoice } from "./engine-choice";

const roots: Root[] = [];
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function renderEngineChoice(
  selectedEngineId: "kokoro" | "chatterbox" = "kokoro",
  onEngineChange = vi.fn(),
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  act(() => {
    root.render(
      <EngineChoice
        onEngineChange={onEngineChange}
        selectedEngineId={selectedEngineId}
      />,
    );
  });

  return { container, onEngineChange };
}

function statusResponse(chatterbox: "not-installed" | "ready" | "unsupported") {
  return new Response(
    JSON.stringify({
      protocolVersion: 1,
      defaultEngineId: "kokoro",
      engines: [
        {
          id: "kokoro",
          availability: "ready",
          selectable: true,
          statusMessage: "Ready.",
        },
        {
          id: "chatterbox",
          availability: chatterbox,
          selectable: chatterbox === "ready",
          statusMessage:
            chatterbox === "not-installed"
              ? "High Quality is not installed."
              : chatterbox === "ready"
                ? "Ready on this machine."
              : "High Quality needs a compatible NVIDIA GPU.",
        },
      ],
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

describe("EngineChoice", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => statusResponse("not-installed")));
  });

  it("enables High Quality when the supervised local service is ready", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => statusResponse("ready")));
    const onEngineChange = vi.fn();
    const { container } = renderEngineChoice("kokoro", onEngineChange);

    await act(async () => Promise.resolve());

    const quality = container.querySelector<HTMLInputElement>(
      "#engine-choice-chatterbox",
    );
    expect(quality?.disabled).toBe(false);
    act(() => quality?.click());
    expect(onEngineChange).toHaveBeenCalledWith("chatterbox");
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("distinguishes the fast default from unavailable High Quality", async () => {
    const { container } = renderEngineChoice();

    await act(async () => Promise.resolve());

    const fast = container.querySelector<HTMLInputElement>("#engine-choice-kokoro");
    const quality = container.querySelector<HTMLInputElement>(
      "#engine-choice-chatterbox",
    );
    expect(fast?.checked).toBe(true);
    expect(fast?.disabled).toBe(false);
    expect(quality?.disabled).toBe(true);
    expect(container.textContent).toContain("Fast / Compatible");
    expect(container.textContent).toContain("High Quality");
    expect(container.textContent).toContain("never downloads itself");
    expect(container.textContent).toContain("voice cloning is disabled");
  });

  it("falls back visibly when a saved High Quality choice is unavailable", async () => {
    const onEngineChange = vi.fn();
    const { container } = renderEngineChoice("chatterbox", onEngineChange);

    await act(async () => Promise.resolve());

    expect(onEngineChange).toHaveBeenCalledWith("kokoro");
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Fast / Compatible remains selected",
    );
  });

  it("keeps the safe default and explains a capability-check failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 500 })));
    const onEngineChange = vi.fn();
    const { container } = renderEngineChoice("kokoro", onEngineChange);

    await act(async () => Promise.resolve());

    expect(onEngineChange).toHaveBeenCalledWith("kokoro");
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Engine status could not be checked",
    );
  });
});
