import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createAudioStreamResponse } from "./http-audio";

describe("createAudioStreamResponse", () => {
  const createdDirectories: string[] = [];

  afterEach(() => {
    for (const directory of createdDirectories.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  function writeFixture(contents: Buffer | string) {
    const directory = mkdtempSync(path.join(tmpdir(), "adaptive-audio-http-"));
    const filePath = path.join(directory, "fixture.wav");
    createdDirectories.push(directory);
    writeFileSync(filePath, contents);
    return filePath;
  }

  function request(range?: string, method = "GET") {
    return new Request("http://localhost/audio", {
      headers: range ? { range } : undefined,
      method,
    });
  }

  it("streams the complete file with full-response metadata when Range is absent", async () => {
    const response = await createAudioStreamResponse(request(), {
      contentType: "audio/wav",
      filePath: writeFixture("0123456789"),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-length")).toBe("10");
    expect(response.headers.get("content-range")).toBeNull();
    expect(response.headers.get("content-type")).toBe("audio/wav");
    await expect(response.text()).resolves.toBe("0123456789");
  });

  it("streams an open-ended byte range", async () => {
    const response = await createAudioStreamResponse(request("bytes=4-"), {
      contentType: "audio/wav",
      filePath: writeFixture("0123456789"),
    });

    expect(response.status).toBe(206);
    expect(response.headers.get("content-length")).toBe("6");
    expect(response.headers.get("content-range")).toBe("bytes 4-9/10");
    await expect(response.text()).resolves.toBe("456789");
  });

  it("streams a suffix byte range", async () => {
    const response = await createAudioStreamResponse(request("bytes=-3"), {
      contentType: "audio/wav",
      filePath: writeFixture("0123456789"),
    });

    expect(response.status).toBe(206);
    expect(response.headers.get("content-length")).toBe("3");
    expect(response.headers.get("content-range")).toBe("bytes 7-9/10");
    await expect(response.text()).resolves.toBe("789");
  });

  it("streams a single requested byte", async () => {
    const response = await createAudioStreamResponse(request("bytes=5-5"), {
      contentType: "audio/wav",
      filePath: writeFixture("0123456789"),
    });

    expect(response.status).toBe(206);
    expect(response.headers.get("content-length")).toBe("1");
    expect(response.headers.get("content-range")).toBe("bytes 5-5/10");
    await expect(response.text()).resolves.toBe("5");
  });

  it.each([
    "bytes=10-12",
    "bytes=7-4",
    "bytes=-0",
    "bytes=0-1,4-5",
    "items=0-1",
  ])("rejects an invalid or unsupported range: %s", async (range) => {
    const response = await createAudioStreamResponse(request(range), {
      contentType: "audio/wav",
      filePath: writeFixture("0123456789"),
    });

    expect(response.status).toBe(416);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-length")).toBe("0");
    expect(response.headers.get("content-range")).toBe("bytes */10");
    await expect(response.arrayBuffer()).resolves.toHaveProperty("byteLength", 0);
  });

  it("returns full metadata and no body for HEAD", async () => {
    const response = await createAudioStreamResponse(request(undefined, "HEAD"), {
      contentType: "audio/mpeg",
      filePath: writeFixture("0123456789"),
    });

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-length")).toBe("10");
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
  });

  it("returns 404 without exposing the missing path", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "adaptive-audio-http-"));
    createdDirectories.push(directory);
    const missingPath = path.join(directory, "private", "missing.wav");

    const response = await createAudioStreamResponse(request(), {
      contentType: "audio/wav",
      filePath: missingPath,
    });

    expect(response.status).toBe(404);
    expect(response.body).toBeNull();
    expect([...response.headers.entries()]).not.toContainEqual([
      "x-audio-path",
      missingPath,
    ]);
  });

  it("returns only the requested bytes from a large fixture", async () => {
    const fixture = Buffer.alloc(4 * 1024 * 1024, 0x61);
    const response = await createAudioStreamResponse(
      request("bytes=2097152-2097168"),
      {
        contentType: "audio/wav",
        filePath: writeFixture(fixture),
      },
    );
    const body = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(206);
    expect(response.headers.get("content-length")).toBe("17");
    expect(body).toHaveLength(17);
    expect(body.equals(Buffer.alloc(17, 0x61))).toBe(true);
  });
});
