import { describe, expect, it } from "vitest";
import { parseChapters } from "@/lib/parser/parse-chapters";

describe("parseChapters", () => {
  it("splits chapter text when chapter headings exist", () => {
    const result = parseChapters("Chapter 1\nHello\nChapter 2\nWorld");

    expect(result).toHaveLength(2);
    expect(result[0]?.title).toBe("Chapter 1");
    expect(result[1]?.title).toBe("Chapter 2");
  });

  it("falls back to one chapter when no headings exist", () => {
    const result = parseChapters("Just one long section");

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("Chapter 1");
  });
});
