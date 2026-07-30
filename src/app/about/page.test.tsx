import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import AboutPage, {
  noticePathCandidates,
  readThirdPartyNotices,
} from "./page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/about",
}));

const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("About and release notices", () => {
  it("renders the application version, exact model attribution, and complete notices", async () => {
    const html = renderToStaticMarkup(await AboutPage());

    expect(html).toContain("About Adaptive Audio Player");
    expect(html).toContain("Version 0.1.0");
    expect(html).toContain("hexgrad/Kokoro-82M");
    expect(html).toContain(
      "f3ff3571791e39611d31c381e3a41a3af07b4987",
    );
    expect(html).toContain("Apache-2.0");
    expect(html).toContain("Complete third-party notices");
    expect(html).toContain("# Third-Party Notices");
    expect(html).toContain("eSpeak NG");
    expect(html).toContain('href="/about"');
  });

  it("finds the installed notice from the packaged runtime working directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "adaptive-about-test-"));
    temporaryRoots.push(root);
    const resourcesRoot = path.join(root, "resources");
    const appRoot = path.join(resourcesRoot, "runtime", "app");
    await mkdir(appRoot, { recursive: true });
    await writeFile(
      path.join(resourcesRoot, "THIRD_PARTY_NOTICES.md"),
      "# Third-Party Notices\n\nPackaged proof.\n",
      "utf8",
    );

    expect(noticePathCandidates(appRoot)).toEqual([
      path.join(appRoot, "THIRD_PARTY_NOTICES.md"),
      path.join(resourcesRoot, "THIRD_PARTY_NOTICES.md"),
    ]);
    await expect(readThirdPartyNotices({ cwd: appRoot })).resolves.toBe(
      "# Third-Party Notices\n\nPackaged proof.\n",
    );
  });

  it("fails closed when the reviewed notice is missing or malformed", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "adaptive-about-test-"));
    temporaryRoots.push(root);

    await expect(readThirdPartyNotices({ cwd: root })).rejects.toThrow(
      "reviewed third-party notice is missing",
    );
    await writeFile(
      path.join(root, "THIRD_PARTY_NOTICES.md"),
      "Unreviewed notice\n",
      "utf8",
    );
    await expect(readThirdPartyNotices({ cwd: root })).rejects.toThrow(
      "invalid heading",
    );
  });
});
