import { describe, expect, it } from "vitest";

import {
  CHATTERBOX_MODEL_REVISION,
  CHATTERBOX_PACKAGE_VERSION,
  getNarrationEngineStatus,
} from "@/lib/backend/tts-engine-capabilities";
import { resolveNarrationEngineSelection } from "@/lib/narration/engines";

describe("local narration engine capabilities", () => {
  it("pins Chatterbox without treating compatible hardware as an installation", async () => {
    const status = await getNarrationEngineStatus({
      inspectRuntime: async () => ({ installed: false }),
      probeNvidia: async () => ({ detected: true, maximumVramMiB: 32_607 }),
    });

    expect(CHATTERBOX_PACKAGE_VERSION).toBe("0.1.7");
    expect(CHATTERBOX_MODEL_REVISION).toBe(
      "5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18",
    );
    expect(status.engines).toEqual([
      expect.objectContaining({ id: "kokoro", selectable: true }),
      expect.objectContaining({
        id: "chatterbox",
        availability: "not-installed",
        selectable: false,
      }),
    ]);
  });

  it("makes High Quality selectable only when the pinned runtime and service are ready", async () => {
    const status = await getNarrationEngineStatus({
      inspectRuntime: async () => ({ installed: true }),
      probeHealth: async () => true,
      probeNvidia: async () => ({ detected: true, maximumVramMiB: 32_607 }),
    });

    expect(status.engines[1]).toEqual({
      id: "chatterbox",
      availability: "ready",
      selectable: true,
      statusMessage: "Ready on this machine.",
    });
  });

  it("keeps an installed but unhealthy service fail-closed", async () => {
    const status = await getNarrationEngineStatus({
      inspectRuntime: async () => ({ installed: true }),
      probeHealth: async () => false,
      probeNvidia: async () => ({ detected: true, maximumVramMiB: 32_607 }),
    });

    expect(status.engines[1]).toEqual(
      expect.objectContaining({
        availability: "unavailable",
        selectable: false,
      }),
    );
  });

  it("reports unsupported hardware without exposing device details", async () => {
    const status = await getNarrationEngineStatus({
      probeNvidia: async () => ({ detected: true, maximumVramMiB: 4_096 }),
    });
    const serialized = JSON.stringify(status);

    expect(status.engines[1]).toEqual(
      expect.objectContaining({
        id: "chatterbox",
        availability: "unsupported",
        selectable: false,
      }),
    );
    expect(serialized).not.toContain("4096");
    expect(serialized).not.toMatch(/[A-Z]:\\/i);
  });

  it("falls back to Fast / Compatible when High Quality is unavailable", async () => {
    const status = await getNarrationEngineStatus({
      probeNvidia: async () => ({ detected: false, maximumVramMiB: null }),
    });

    expect(resolveNarrationEngineSelection("CHATTERBOX", status.engines)).toEqual({
      didFallback: true,
      selectedEngineId: "kokoro",
      message: expect.stringContaining("Fast / Compatible remains selected"),
    });
  });
});
