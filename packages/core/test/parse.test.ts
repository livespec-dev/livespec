import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractTrackedItems,
  parseLiveSpecDocument,
  parseMarkdownToAst
} from "../src/index.js";

const fixture = (name: string): string =>
  readFileSync(path.join(import.meta.dirname, "fixtures", name), "utf8");

describe("tracked-item extraction", () => {
  it("handles leading IDs, emphasis, inline-code rejection, and duplicate runtime keys", () => {
    const sourceUri = "file:///specs/tracked-items.md";
    const root = parseMarkdownToAst(fixture("tracked-items.md"));
    const trackedItems = extractTrackedItems(root, sourceUri);

    expect(trackedItems.map((item) => item.id)).toEqual([
      "T001",
      "SC-001",
      "REQ-42",
      "T001"
    ]);
    expect(trackedItems[0]?.completed).toBe(false);
    expect(trackedItems[1]?.completed).toBe(true);
    expect(new Set(trackedItems.map((item) => item.runtimeKey)).size).toBe(4);
    expect(trackedItems[2]?.line).toBe(5);
  });

  it("computes progress against the whole document", () => {
    const result = parseLiveSpecDocument(
      "file:///specs/whole-document.md",
      fixture("whole-document.md")
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.document.progress).toEqual({
        total: 3,
        complete: 1,
        remaining: 2
      });
      expect(result.document.trackedItems).toHaveLength(3);
    }
  });

  it("treats empty input as an empty document instead of an error", () => {
    const result = parseLiveSpecDocument("file:///specs/empty.md", "");

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.document.isEmpty).toBe(true);
      expect(result.document.trackedItems).toEqual([]);
    }
  });

  it("returns a degraded parse result when markdown parsing throws", () => {
    const parseError = new Error("parser exploded");
    const result = parseLiveSpecDocument("file:///specs/broken.md", "# Broken", {
      parseMarkdownToAst: () => {
        throw parseError;
      }
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error).toBe(parseError);
      expect(result.document.sourceUri).toBe("file:///specs/broken.md");
      expect(result.document.trackedItems).toEqual([]);
      expect(result.document.progress).toEqual({
        total: 0,
        complete: 0,
        remaining: 0
      });
      expect(result.document.isEmpty).toBe(false);
    }
  });
});
